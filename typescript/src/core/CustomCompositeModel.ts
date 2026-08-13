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

  private constructor(record: XmlRecord) {
    this.name = record.attributes.nm ?? "default";
    this.flags = CustomCompositeModel.integer(record.attributes.f, 0);
    this.sizeX = CustomCompositeModel.integer(record.attributes.sx, 1);
    this.sizeY = CustomCompositeModel.integer(record.attributes.sy, 1);
    const compactBus = record.attributes.bcs === "1";
    this.pins = [];
    this.elements = [];

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

  public static load(record: XmlRecord): CustomCompositeModel {
    const model = new CustomCompositeModel(record);
    CustomCompositeModel.models.set(model.name, model);
    return model;
  }

  public static get(name: string): CustomCompositeModel | null {
    return CustomCompositeModel.models.get(name) ?? null;
  }

  public static list(): readonly CustomCompositeModel[] {
    return [...CustomCompositeModel.models.values()];
  }

  public static remove(name: string): boolean {
    return CustomCompositeModel.models.delete(name);
  }

  private static integer(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
