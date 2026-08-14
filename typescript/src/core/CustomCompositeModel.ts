import { LEGACY_INTERNAL_COMPOSITE_MODELS } from "./BuiltinCompositeModels.generated";
import { CustomLogicModel } from "./CustomLogicModel";
import type { CircuitElementRecord } from "./CircuitLoader";
import { ElementFactory } from "./ElementFactory";
import { StringTokenizer } from "./StringTokenizer";
import type { XmlRecord } from "./XMLDeserializer";

export interface CustomCompositePin {
  name: string;
  node: number;
  position: number;
  side: number;
  busWidth: number;
  busZ: number;
}

/**
 * Runtime registry for XML <ccm> subcircuit definitions.
 *
 * Models are local to the circuit being loaded. Keeping the XML child records
 * intact lets CustomCompositeElm build the same component graph as the Java
 * CompositeElm implementation, including nested custom subcircuits.
 */
export class CustomCompositeModel {
  private static readonly models = new Map<string, CustomCompositeModel>();

  public readonly name: string;
  public readonly flags: number;
  public readonly sizeX: number;
  public readonly sizeY: number;
  public readonly pins: CustomCompositePin[];
  public readonly elements: XmlRecord[];
  /** Java keeps these in its global model map and never writes them to a file. */
  public readonly internal: boolean;

  private constructor(record: XmlRecord, internal = false) {
    this.name = record.attributes.nm ?? "default";
    this.flags = CustomCompositeModel.integer(record.attributes.f, 0);
    this.sizeX = CustomCompositeModel.integer(record.attributes.sx, 1);
    this.sizeY = CustomCompositeModel.integer(record.attributes.sy, 1);
    const compactBus = record.attributes.bcs === "1";
    this.pins = [];
    this.elements = [];
    this.internal = internal;

    for (const child of record.children) {
      if (child.tagName !== "ext") {
        this.elements.push(child);
        continue;
      }
      const name = child.attributes.nm ?? "";
      const node = CustomCompositeModel.integer(child.attributes.nd, 0);
      const position = CustomCompositeModel.integer(
        child.attributes.ps,
        0
      );
      const side = CustomCompositeModel.integer(child.attributes.sd, 0);
      const busWidth = Math.max(
        1,
        CustomCompositeModel.integer(child.attributes.bw, 1)
      );
      if (compactBus && busWidth > 1) {
        for (let bit = 0; bit < busWidth; bit += 1) {
          this.pins.push({
            name,
            node: node + bit,
            position,
            side,
            busWidth,
            busZ: bit
          });
        }
      } else {
        this.pins.push({
          name,
          node,
          position,
          side,
          busWidth,
          busZ: CustomCompositeModel.integer(
            child.attributes.bz,
            0
          )
        });
      }
    }
  }

  public static clear(): void {
    CustomCompositeModel.models.clear();
  }

  public static load(
    record: XmlRecord,
    internal = false
  ): CustomCompositeModel {
    const model = new CustomCompositeModel(record, internal);
    CustomCompositeModel.models.set(model.name, model);
    return model;
  }

  public static get(name: string): CustomCompositeModel | null {
    return CustomCompositeModel.models.get(name) ?? null;
  }

  public static list(): readonly CustomCompositeModel[] {
    // This is Java's getModelList() equivalent: the editor/manager sees only
    // user models.  LM317 and TL431 retain their dedicated Draw commands.
    return [...CustomCompositeModel.models.values()].filter(
      (model) => !model.internal
    );
  }

  /**
   * Port of Java CustomCompositeModel.convertOldFormatToXml(), applied once to
   * the two legacy internal regulator definitions.  The source strings live in
   * a committed TS module generated at build time; no browser path reads Java
   * or public/legacy assets.
   */
  public static loadInternalModels(factory: ElementFactory): void {
    for (const source of Object.values(LEGACY_INTERNAL_COMPOSITE_MODELS)) {
      const record = CustomCompositeModel.convertLegacyModel(source, factory);
      CustomCompositeModel.load(record, true);
    }
  }

  public static remove(name: string): boolean {
    return CustomCompositeModel.models.delete(name);
  }

  private static integer(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private static convertLegacyModel(
    source: string,
    factory: ElementFactory
  ): XmlRecord {
    const tokens = new StringTokenizer(source, " ");
    if (tokens.nextToken() !== ".") {
      throw new Error("Invalid built-in composite model record");
    }
    const name = CustomLogicModel.unescape(tokens.nextToken());
    const flags = tokens.nextToken();
    const sizeX = tokens.nextToken();
    const sizeY = tokens.nextToken();
    const extCount = Number.parseInt(tokens.nextToken(), 10);
    if (!Number.isFinite(extCount) || extCount < 0) {
      throw new Error(`Invalid external-pin count in ${name}`);
    }
    const children: XmlRecord[] = [];
    for (let index = 0; index < extCount; index += 1) {
      children.push({
        tagName: "ext",
        attributes: {
          nm: CustomLogicModel.unescape(tokens.nextToken()),
          nd: tokens.nextToken(),
          ps: tokens.nextToken(),
          sd: tokens.nextToken()
        },
        contents: null,
        children: [],
        kind: "unknown"
      });
    }
    const nodeList = CustomLogicModel.unescape(tokens.nextToken());
    const elementDump = CustomLogicModel.unescape(tokens.nextToken());
    const nodes = new StringTokenizer(nodeList, "\r");
    const dumps = new StringTokenizer(elementDump, " ");
    while (nodes.hasMoreTokens()) {
      const nodeLine = nodes.nextToken();
      const nodeTokens = new StringTokenizer(nodeLine);
      const legacyType = nodeTokens.nextToken();
      const type = CustomCompositeModel.legacyType(legacyType);
      const numbers = nodeTokens.toArray().join(" ");
      if (!dumps.hasMoreTokens()) {
        throw new Error(`Missing ${legacyType} state in ${name}`);
      }
      const state = CustomLogicModel.unescape(dumps.nextToken());
      const stateTokens = new StringTokenizer(state);
      const flagsToken = stateTokens.nextToken();
      const flagsValue = Number.parseInt(flagsToken, 10);
      if (!Number.isFinite(flagsValue)) {
        throw new Error(`Invalid ${legacyType} flags in ${name}`);
      }
      const elementRecord: CircuitElementRecord = {
        kind: "element",
        type,
        dumpType: type.charCodeAt(0),
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        flags: flagsValue,
        arguments: stateTokens.toArray(),
        raw: state,
        line: 0
      };
      const element = factory.createFromRecord(elementRecord);
      if (element === null) {
        throw new Error(`Unsupported ${legacyType} in ${name}`);
      }
      const document = globalThis.document.implementation.createDocument(
        "",
        type
      );
      const xml = document.documentElement;
      element.dumpXml(document, xml);
      // Java removes the zero position after deserialising the legacy child.
      // The native XML factory deliberately requires a position, so retain the
      // same neutral coordinates rather than inventing geometry from nodes.
      const attributes: Record<string, string> = { nn: numbers };
      for (const attribute of Array.from(xml.attributes)) {
        attributes[attribute.name] = attribute.value;
      }
      children.push({
        tagName: element.getXmlDumpType(),
        attributes,
        contents: null,
        children: [],
        kind: "element"
      });
    }
    if (dumps.hasMoreTokens()) {
      throw new Error(`Excess element state in ${name}`);
    }
    return {
      tagName: "ccm",
      attributes: { nm: name, f: flags, sx: sizeX, sy: sizeY },
      contents: null,
      children,
      kind: "model"
    };
  }

  private static legacyType(type: string): string {
    const mapped: Record<string, string> = {
      JfetElm: "j",
      ResistorElm: "r",
      CapacitorElm: "c",
      TransistorElm: "t",
      DiodeElm: "d"
    };
    const result = mapped[type];
    if (result === undefined) {
      throw new Error(`Unsupported legacy composite element ${type}`);
    }
    return result;
  }
}
