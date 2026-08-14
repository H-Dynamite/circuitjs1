// Keep these small source manifests with the native port. The GWT baseline is
// deliberately excluded from TS-only releases, so this data stays self-contained.
import localeZhSource from "./examples/metadata/locale_zh.txt?raw";
import setupListSource from "./examples/metadata/setuplist.txt?raw";

const modules = import.meta.glob("./examples/circuits/*.txt", {
  eager: true,
  query: "?raw",
  import: "default"
}) as Record<string, string>;

export interface CircuitExample {
  id: string;
  name: string;
  categoryPath: string[];
  order: number;
  source: string;
}

/** One physical line in the original setuplist menu. Duplicate source ids are intentional. */
export interface CircuitMenuEntry extends CircuitExample {}

interface CircuitMenuMetadata {
  id: string;
  name: string;
  categoryPath: string[];
  order: number;
}

const additionalNames: Record<string, string> = {
  "analogrecip.txt": "模拟倒数运算",
  "avr8js-analog.txt": "AVR8js 模拟输入",
  "avr8js-logic.txt": "AVR8js 逻辑接口",
  "avr8js-strobe.txt": "AVR8js 选通信号",
  "jsinterface.txt": "JavaScript 接口示例",
  "motorprotect.txt": "电机保护开关",
  "relays.txt": "继电器示例"
};

function unescapeLocaleValue(value: string): string {
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_, digits: string) =>
      String.fromCharCode(Number.parseInt(digits, 16))
    )
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

export function parseLocale(source: string): Map<string, string> {
  const locale = new Map<string, string>();
  for (const rawLine of source.split(/\r?\n/)) {
    const match = rawLine.match(/^"((?:\\.|[^"])*)"="((?:\\.|[^"])*)"$/);
    if (match === null) continue;
    locale.set(
      unescapeLocaleValue(match[1]),
      unescapeLocaleValue(match[2])
    );
  }
  return locale;
}

export function parseCircuitMenu(
  source: string,
  locale: ReadonlyMap<string, string>
): CircuitMenuMetadata[] {
  const metadata: CircuitMenuMetadata[] = [];
  const categoryPath: string[] = [];
  let order = 0;
  const translate = (value: string) => locale.get(value) ?? value;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (line.startsWith("+")) {
      categoryPath.push(translate(line.slice(1).trim()));
      continue;
    }
    if (line === "-") {
      categoryPath.pop();
      continue;
    }

    const match = line.match(/^>?(\S+\.txt)\s+(.+)$/);
    if (match === null) continue;
    metadata.push({
      id: match[1],
      name: translate(match[2].trim()),
      categoryPath: [...categoryPath],
      order
    });
    order += 1;
  }
  return metadata;
}

const originalMenu = parseCircuitMenu(
  setupListSource,
  parseLocale(localeZhSource)
);

const sourcesById = new Map<string, string>(
  Object.entries(modules).map(([path, source]) => [
    path.split("/").pop() ?? path,
    source
  ])
);

const missingMenuSources = originalMenu
  .filter((entry) => !sourcesById.has(entry.id))
  .map((entry) => entry.id);
if (missingMenuSources.length > 0) {
  throw new Error(
    `Circuit menu references missing sources: ${missingMenuSources.join(", ")}`
  );
}

/**
 * Faithful projection of setuplist.txt. It is deliberately separate from the
 * complete source-file catalog: cmosinverter appears twice in the original
 * menu and seven TS-loadable files are not menu entries at all.
 */
export const circuitMenuEntries: CircuitMenuEntry[] = originalMenu.map(
  (entry) => ({
    ...entry,
    source: sourcesById.get(entry.id)!
  })
);

const firstMenuEntryById = new Map<string, CircuitMenuMetadata>();
for (const entry of originalMenu) {
  if (!firstMenuEntryById.has(entry.id)) {
    firstMenuEntryById.set(entry.id, entry);
  }
}

/**
 * Complete loadable source catalog. Entries outside setuplist.txt remain
 * available to tests and direct loading, but are never inserted into the
 * legacy-equivalent Circuit menu.
 */
export const circuitExamples: CircuitExample[] = Object.entries(modules)
  .map(([path, source]) => {
    const id = path.split("/").pop() ?? path;
    const original = firstMenuEntryById.get(id);
    const fallback = id
      .replace(/\.txt$/i, "")
      .replace(/[-_]+/g, " ");
    return {
      id,
      name: original?.name ?? additionalNames[id] ?? fallback,
      categoryPath: original?.categoryPath ?? ["附加示例"],
      order: original?.order ?? Number.MAX_SAFE_INTEGER,
      source
    };
  })
  .sort(
    (first, second) =>
      first.order - second.order ||
      first.name.localeCompare(second.name, "zh-CN", { numeric: true })
  );

export const featuredExampleIds = [
  "ohms.txt",
  "cap.txt",
  "induct.txt",
  "rectify.txt",
  "opamp.txt",
  "555square.txt",
  "counter.txt",
  "7segdecoder.txt",
  "transformer.txt",
  "relay.txt",
  "ota-gain.txt",
  "adder4-sc.txt",
  "fullrect-sc.txt"
];
