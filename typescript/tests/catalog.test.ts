import { beforeEach, describe, expect, it, vi } from "vitest";
import { COMPONENTS, NativeCircuitApp } from "../src/app/NativeCircuitApp";
import {
  DRAW_MENU_DIRECT_ITEMS,
  DRAW_MENU_GROUPS
} from "../src/app/DrawMenu";
import { ElementFactory, StringTokenizer } from "../src/core";
import {
  circuitExamples,
  circuitMenuEntries
} from "../src/examples";
import localeZhSource from "../src/examples/metadata/locale_zh.txt?raw";
import setupListSource from "../src/examples/metadata/setuplist.txt?raw";

interface OriginalMenuRecord {
  id: string;
  name: string;
  categoryPath: string[];
  order: number;
}

function decodeLocale(value: string): string {
  return value
    .replace(/\\u([0-9a-f]{4})/gi, (_, digits: string) =>
      String.fromCharCode(Number.parseInt(digits, 16))
    )
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseOriginalLocale(source: string): Map<string, string> {
  const locale = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^"((?:\\.|[^"])*)"="((?:\\.|[^"])*)"$/);
    if (match !== null) locale.set(decodeLocale(match[1]), decodeLocale(match[2]));
  }
  return locale;
}

/** Independent test oracle for the setuplist line grammar. */
function parseOriginalMenu(source: string, locale: ReadonlyMap<string, string>): OriginalMenuRecord[] {
  const entries: OriginalMenuRecord[] = [];
  const categoryPath: string[] = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    if (line.startsWith("+")) {
      const label = line.slice(1).trim();
      categoryPath.push(locale.get(label) ?? label);
      continue;
    }
    if (line === "-") {
      categoryPath.pop();
      continue;
    }
    const match = line.match(/^>?(\S+\.txt)\s+(.+)$/);
    if (match === null) continue;
    const label = match[2].trim();
    entries.push({
      id: match[1],
      name: locale.get(label) ?? label,
      categoryPath: [...categoryPath],
      order: entries.length
    });
  }
  return entries;
}

describe("native component catalog", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  });

  it("constructs every exposed drawing tool", () => {
    const factory = new ElementFactory();
    const failures: string[] = [];
    for (const component of COMPONENTS) {
      try {
        const element = factory.create(
          component.type,
          32,
          32,
          128,
          32,
          component.flags ?? 0,
          new StringTokenizer(component.arguments)
        );
        expect(element, component.id).not.toBeNull();
        element?.setPoints();
      } catch (error) {
        failures.push(`${component.id}: ${String(error)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps every drawing tool in the legacy menu hierarchy", () => {
    const menuIds = [
      ...DRAW_MENU_DIRECT_ITEMS.map((item) => item.id),
      ...DRAW_MENU_GROUPS.flatMap((group) =>
        group.items.map((item) => item.id)
      )
    ];
    expect(new Set(menuIds).size).toBe(menuIds.length);
    expect(new Set(menuIds)).toEqual(
      new Set(COMPONENTS.map((component) => component.id))
    );
  });

  it("keeps every original menu line, including duplicate source ids", () => {
    const originalEntries = parseOriginalMenu(
      setupListSource,
      parseOriginalLocale(localeZhSource)
    );
    expect(
      circuitMenuEntries.map(({ id, name, categoryPath, order }) => ({
        id,
        name,
        categoryPath,
        order
      }))
    ).toEqual(originalEntries);
    expect(circuitMenuEntries).toHaveLength(360);
    expect(
      circuitMenuEntries.filter((entry) => entry.id === "cmosinverter.txt")
    ).toHaveLength(2);
  });

  it("keeps the complete source catalog separate from the legacy menu", () => {
    expect(circuitExamples).toHaveLength(366);
    expect(new Set(circuitMenuEntries.map((entry) => entry.id))).toEqual(
      new Set(
        circuitExamples
          .filter((example) => example.order < Number.MAX_SAFE_INTEGER)
          .map((example) => example.id)
      )
    );
    expect(
      circuitExamples
        .filter((example) => example.order === Number.MAX_SAFE_INTEGER)
        .map((example) => example.id)
        .sort()
    ).toEqual([
      "analogrecip.txt",
      "avr8js-analog.txt",
      "avr8js-logic.txt",
      "avr8js-strobe.txt",
      "jsinterface.txt",
      "motorprotect.txt",
      "relays.txt"
    ]);
    expect(
      circuitExamples.find((example) => example.id === "ohms.txt")
    ).toMatchObject({
      name: "欧姆定律",
      categoryPath: ["基础知识"]
    });
    expect(
      circuitExamples.find((example) => example.id === "rectify.txt")
    ).toMatchObject({
      name: "半波整流",
      categoryPath: ["二极管"]
    });
    expect(
      circuitExamples.find((example) => example.id === "blank.txt")
    ).toMatchObject({
      name: "空白电路",
      categoryPath: []
    });
    expect(
      circuitExamples.every((example) => example.name.trim().length > 0)
    ).toBe(true);
  });

  it("renders only setuplist entries in the legacy-equivalent Circuit menu", () => {
    const root = document.querySelector<HTMLElement>("#app");
    expect(root).not.toBeNull();
    new NativeCircuitApp(root!);

    const renderedIds = Array.from(
      root!.querySelectorAll<HTMLElement>(
        ".example-menu [data-example]"
      )
    ).map((button) => button.dataset.example);
    expect(renderedIds).toEqual(
      circuitMenuEntries.map((entry) => entry.id)
    );
    expect(
      root!.querySelector('[data-action="examples"]')
    ).toBeNull();
  });
});
