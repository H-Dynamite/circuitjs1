import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Logic-input seven/fourteen/sixteen-segment display. */
export class SevenSegElm extends ChipElm {
  public baseSegmentCount = 7;
  public segmentCount = 7;
  public extraSegment = 0;
  public diodeDirection = 0;
  public pinCount = 7;
  public commonPin = -1;

  public constructor(x: number, y: number);
  public constructor(
    x: number,
    y: number,
    x2: number,
    y2: number,
    flags: number,
    tokenizer: StringTokenizer
  );
  public constructor(
    x: number,
    y: number,
    x2 = x,
    y2 = y,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    const tokens = tokenizer ?? new StringTokenizer("");
    super(x, y, x2, y2, flags, tokens);
    if (tokens.hasMoreTokens()) {
      this.baseSegmentCount =
        Number.parseInt(tokens.nextToken(), 10) || 7;
      this.extraSegment = Number.parseInt(tokens.nextToken(), 10) || 0;
      this.diodeDirection = Number.parseInt(tokens.nextToken(), 10) || 0;
    }
    this.setPinCount();
  }

  private setPinCount(): void {
    this.segmentCount =
      this.baseSegmentCount + (this.extraSegment > 0 ? 1 : 0);
    this.pinCount =
      this.segmentCount + (this.diodeDirection === 0 ? 0 : 1);
    this.commonPin =
      this.diodeDirection === 0 ? -1 : this.pinCount - 1;
    this.setupPins();
    this.allocNodes();
  }

  public override setupPins(): void {
    const segments = this.segmentCount || 7;
    const count = this.pinCount || segments;
    this.bits = segments;
    this.sizeX = this.baseSegmentCount === 7 ? 4 : 5;
    this.sizeY = Math.ceil(count / 2);
    this.pins = Array<ChipPin>(count);
    const leftCount = Math.ceil(this.baseSegmentCount / 2);
    let index = 0;
    for (; index < leftCount && index < segments; index += 1) {
      this.pins[index] = new ChipPin(
        index,
        ChipElm.SIDE_W,
        String.fromCharCode(97 + index)
      );
    }
    for (let position = 0; index < segments; index += 1, position += 1) {
      this.pins[index] = new ChipPin(
        position,
        ChipElm.SIDE_E,
        String.fromCharCode(97 + index)
      );
    }
    if (this.commonPin >= 0) {
      this.pins[this.commonPin] = new ChipPin(
        this.sizeY - 1,
        ChipElm.SIDE_E,
        this.diodeDirection === 1 ? "gnd" : "Vcc"
      );
    }
  }

  public getLitSegments(): boolean[] {
    return Array.from({ length: this.segmentCount }, (_, index) => {
      if (this.diodeDirection === 0) {
        return this.volts[index] > this.getThreshold();
      }
      const common = this.volts[this.commonPin];
      return (
        this.diodeDirection * (this.volts[index] - common) > 0.5
      );
    });
  }

  public override getPostCount(): number {
    return this.pinCount || 7;
  }

  public override getVoltageSourceCount(): number {
    return 0;
  }

  public override getDumpType(): number {
    return 157;
  }

  public override getXmlDumpType(): string {
    return "ssd";
  }

  public override getChipName(): string {
    return `${this.segmentCount}-segment display`;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.baseSegmentCount} ${this.extraSegment} ` +
      `${this.diodeDirection}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ba", this.baseSegmentCount);
    XMLSerializer.dumpAttr(element, "ex", this.extraSegment);
    XMLSerializer.dumpAttr(element, "di", this.diodeDirection);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.baseSegmentCount = xml.parseIntAttr("ba", this.baseSegmentCount);
    this.extraSegment = xml.parseIntAttr("ex", this.extraSegment);
    this.diodeDirection = xml.parseIntAttr("di", this.diodeDirection);
    this.setPinCount();
  }

  public override getConnection(_first: number, _second: number): boolean {
    return this.diodeDirection !== 0;
  }
}
