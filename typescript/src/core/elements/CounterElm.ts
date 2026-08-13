import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Binary/modulus counter with optional up/down input. */
export class CounterElm extends ChipElm {
  public static readonly FLAG_UP_DOWN = 4;
  public static readonly FLAG_NEGATIVE_EDGE = 8;
  public invertReset = true;
  public modulus = 0;

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
      this.invertReset = tokens.nextToken().toLowerCase() === "true";
    }
    if (tokens.hasMoreTokens()) {
      this.modulus = Number.parseInt(tokens.nextToken(), 10) || 0;
    }
    this.pins[1].bubble = this.invertReset;
  }

  public override needsBits(): boolean {
    return true;
  }

  public hasUpDown(): boolean {
    return this.hasFlag(CounterElm.FLAG_UP_DOWN);
  }

  public negativeEdgeTriggered(): boolean {
    return this.hasFlag(CounterElm.FLAG_NEGATIVE_EDGE);
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = this.useBus() ? 3 : this.bits;
    this.pins = Array<ChipPin>(this.getPostCount());
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "");
    this.pins[0].clock = true;
    this.pins[0].bubble = this.negativeEdgeTriggered();
    this.pins[1] = new ChipPin(this.sizeY - 1, ChipElm.SIDE_W, "R");
    this.pins[1].bubble = this.invertReset;
    this.makeBitPins(
      this.bits,
      0,
      ChipElm.SIDE_E,
      2,
      "Q",
      true,
      true,
      true
    );
    if (this.hasUpDown()) {
      this.pins[this.bits + 2] = new ChipPin(
        this.sizeY - 2,
        ChipElm.SIDE_W,
        "U/D"
      );
    }
    this.allocNodes();
  }

  public override execute(): void {
    const negative = this.negativeEdgeTriggered();
    if (this.pins[0].value !== negative && this.lastClock === negative) {
      let value = 0;
      const lastBit = this.bits + 1;
      for (let index = 0; index < this.bits; index += 1) {
        if (this.pins[lastBit - index].value) value |= 1 << index;
      }
      const direction =
        this.hasUpDown() && this.pins[this.bits + 2].value ? -1 : 1;
      value += direction;
      const base = this.modulus || 1 << this.bits;
      value = ((value % base) + base) % base;
      for (let index = 0; index < this.bits; index += 1) {
        this.pins[lastBit - index].value =
          (value & (1 << index)) !== 0;
      }
    }
    if ((!this.pins[1].value) === this.invertReset) {
      for (let index = 0; index < this.bits; index += 1) {
        this.pins[index + 2].value = false;
      }
    }
    this.lastClock = this.pins[0].value;
  }

  public override getPostCount(): number {
    return this.bits + (this.hasUpDown() ? 3 : 2);
  }

  public override getVoltageSourceCount(): number {
    return this.bits;
  }

  public override getDumpType(): number {
    return 164;
  }

  public override getXmlDumpType(): string {
    return "ctr";
  }

  public override getChipName(): string {
    return this.modulus === 0 ? "Counter" : `Counter (mod ${this.modulus})`;
  }

  public override dump(): string {
    return `${super.dump()} ${this.invertReset} ${this.modulus}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "in", this.invertReset);
    XMLSerializer.dumpAttr(element, "mo", this.modulus);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.invertReset = xml.parseBooleanAttr("in", this.invertReset);
    this.modulus = xml.parseIntAttr("mo", this.modulus);
    this.pins[1].bubble = this.invertReset;
  }
}
