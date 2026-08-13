import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Synchronous loadable counter ported from Counter2Elm.java. */
export class Counter2Elm extends ChipElm {
  public modulus = 0;
  public clk = 0;
  public clr = 0;
  public enp = 0;
  public ent = 0;
  public rco = 0;
  public load = 0;
  public carry = false;

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
      const modulus = Number.parseInt(tokens.nextToken(), 10);
      if (Number.isFinite(modulus)) this.modulus = modulus;
    }
    this.setupPins();
  }

  public override needsBits(): boolean {
    return true;
  }

  public override setupPins(): void {
    const bitCount = this.bits || 4;
    const rows = this.useBus() ? 1 : bitCount;
    this.sizeX = 2;
    this.sizeY = rows + 3;
    this.pins = Array<ChipPin>(bitCount * 2 + 6);
    this.makeBitPins(
      bitCount,
      1,
      ChipElm.SIDE_E,
      0,
      "Q",
      true,
      true,
      true
    );
    this.makeBitPins(
      bitCount,
      1,
      ChipElm.SIDE_W,
      bitCount,
      "I",
      false,
      false,
      true
    );
    const firstControl = bitCount * 2;
    this.clk = firstControl;
    this.clr = firstControl + 1;
    this.enp = firstControl + 2;
    this.rco = firstControl + 3;
    this.load = firstControl + 4;
    this.ent = firstControl + 5;
    this.pins[this.clk] = new ChipPin(0, ChipElm.SIDE_W, "");
    this.pins[this.clk].clock = true;
    this.pins[this.clr] = new ChipPin(rows + 1, ChipElm.SIDE_W, "CLR");
    this.pins[this.clr].bubble = true;
    this.pins[this.enp] = new ChipPin(rows + 2, ChipElm.SIDE_W, "EnP");
    this.pins[this.rco] = new ChipPin(0, ChipElm.SIDE_E, "RCO");
    this.pins[this.rco].output = true;
    this.pins[this.load] = new ChipPin(
      rows + 1,
      ChipElm.SIDE_E,
      "LOAD"
    );
    this.pins[this.load].bubble = true;
    this.pins[this.ent] = new ChipPin(rows + 2, ChipElm.SIDE_E, "EnT");
    this.allocNodes();
  }

  public override getPostCount(): number {
    return (this.bits || 4) * 2 + 6;
  }

  public override getVoltageSourceCount(): number {
    return (this.bits || 4) + 1;
  }

  public override getChipName(): string {
    return this.modulus === 0
      ? "Counter"
      : `Counter (mod ${this.modulus})`;
  }

  public override getDumpType(): number {
    return 421;
  }

  public override getXmlDumpType(): string {
    return "ctr2";
  }

  public override dump(): string {
    return `${super.dump()} ${this.modulus}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "mo", this.modulus);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.modulus = xml.parseIntAttr("mo", this.modulus);
    this.setupPins();
    this.pins[this.clr].value = true;
    this.volts[this.clr] = this.highVoltage;
  }

  public override execute(): void {
    const risingEdge =
      this.pins[this.clk].value && !this.lastClock;
    if (
      risingEdge &&
      this.pins[this.enp].value &&
      this.pins[this.ent].value
    ) {
      let value = this.readValue(this.pins.slice(0, this.bits));
      const realModulus =
        this.modulus === 0 ? 1 << this.bits : this.modulus;
      value = (value + 1) % realModulus;
      this.writeValue(value);
      this.carry = value === realModulus - 1;
    }
    if (risingEdge && !this.pins[this.load].value) {
      for (let index = 0; index < this.bits; index += 1) {
        this.writeOutput(
          index,
          this.pins[index + this.bits].value
        );
      }
      const value = this.readValue(this.pins.slice(0, this.bits));
      const realModulus =
        this.modulus === 0 ? 1 << this.bits : this.modulus;
      this.carry = value === realModulus - 1;
    }
    if (!this.pins[this.clr].value) {
      for (let index = 0; index < this.bits; index += 1) {
        this.writeOutput(index, false);
      }
      this.carry = false;
    }
    this.lastClock = this.pins[this.clk].value;
    this.writeOutput(
      this.rco,
      this.carry && this.pins[this.ent].value
    );
  }

  private readValue(pins: ChipPin[]): number {
    let value = 0;
    const lastBit = this.bits - 1;
    for (let index = 0; index < this.bits; index += 1) {
      if (pins[lastBit - index].value) value |= 1 << index;
    }
    return value;
  }

  private writeValue(value: number): void {
    const lastBit = this.bits - 1;
    for (let index = 0; index < this.bits; index += 1) {
      this.writeOutput(
        lastBit - index,
        (value & (1 << index)) !== 0
      );
    }
  }
}
