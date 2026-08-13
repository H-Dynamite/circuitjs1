import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Decimal/hex/octal numeric display. */
export class DecimalDisplayElm extends ChipElm {
  public bitCount = 4;
  public displayMode = 0;

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
      this.bitCount = Number.parseInt(tokens.nextToken(), 10) || 4;
    }
    if (tokens.hasMoreTokens()) {
      this.displayMode = Number.parseInt(tokens.nextToken(), 10) || 0;
    }
    this.setupPins();
    this.allocNodes();
  }

  public override setupPins(): void {
    const count = this.bitCount || 4;
    this.sizeX = 3;
    this.sizeY = this.useBus() ? 2 : count;
    this.pins = Array<ChipPin>(count);
    this.makeBitPins(
      count,
      0,
      ChipElm.SIDE_W,
      0,
      "I",
      false,
      false,
      false
    );
  }

  public getDisplayValue(): string {
    let value = 0;
    for (let index = 0; index < this.bitCount; index += 1) {
      if (this.volts[index] > this.getThreshold()) value |= 1 << index;
    }
    if (this.displayMode === 1) return value.toString(16).toUpperCase();
    if (this.displayMode === 2) return value.toString(8);
    return String(value);
  }

  public override getChipName(): string {
    if (this.displayMode === 1) return "hex display";
    if (this.displayMode === 2) return "octal display";
    return "decimal display";
  }

  public override getPostCount(): number {
    return this.bitCount || 4;
  }

  public override getVoltageSourceCount(): number {
    return 0;
  }

  public override getDumpType(): number {
    return 419;
  }

  public override getXmlDumpType(): string {
    return "dd";
  }

  public override dump(): string {
    return `${super.dump()} ${this.bitCount} ${this.displayMode}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "bc", this.bitCount);
    XMLSerializer.dumpAttr(element, "dm", this.displayMode);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.bitCount = xml.parseIntAttr("bc", this.bitCount);
    this.displayMode = xml.parseIntAttr("dm", this.displayMode);
    this.setupPins();
    this.allocNodes();
  }
}
