import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Resistive analog multiplexer, ported from AnalogMuxElm.java. */
export class AnalogMuxElm extends ChipElm {
  public selectBitCount = 2;
  public inputCount = 4;
  public outputPin = 6;
  public rOn = 20;
  public rOff = 1e10;
  public threshold = 2.5;

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
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags, tokenizer);
    if (tokenizer.hasMoreTokens()) {
      this.selectBitCount =
        Number.parseInt(tokenizer.nextToken(), 10) ||
        this.selectBitCount;
    }
    if (tokenizer.hasMoreTokens()) {
      this.rOn = Number(tokenizer.nextToken()) || this.rOn;
    }
    if (tokenizer.hasMoreTokens()) {
      this.rOff = Number(tokenizer.nextToken()) || this.rOff;
    }
    if (tokenizer.hasMoreTokens()) {
      const threshold = Number(tokenizer.nextToken());
      if (Number.isFinite(threshold)) this.threshold = threshold;
    }
    this.setupPins();
  }

  public override setupPins(): void {
    const selectBits = this.selectBitCount || 2;
    this.inputCount = 1 << selectBits;
    this.sizeX = selectBits + 1;
    this.sizeY = this.inputCount + 1;
    this.pins = Array<ChipPin>(
      this.inputCount + selectBits + 1
    );
    for (let index = 0; index < this.inputCount; index += 1) {
      this.pins[index] = new ChipPin(
        index,
        ChipElm.SIDE_W,
        `I${index}`
      );
    }
    for (let index = 0; index < selectBits; index += 1) {
      this.pins[this.inputCount + index] = new ChipPin(
        index + 1,
        ChipElm.SIDE_S,
        `S${index}`
      );
    }
    this.outputPin = this.inputCount + selectBits;
    this.pins[this.outputPin] = new ChipPin(
      0,
      ChipElm.SIDE_E,
      "Z"
    );
    this.allocNodes();
  }

  public override getPostCount(): number {
    const selectBits = this.selectBitCount || 2;
    return (this.inputCount || 1 << selectBits) + selectBits + 1;
  }

  public override getVoltageSourceCount(): number {
    return 0;
  }

  public override getDumpType(): number {
    return 432;
  }

  public override getChipName(): string {
    return "Analog Mux";
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.selectBitCount} ${this.rOn} ` +
      `${this.rOff} ${this.threshold}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "sb", this.selectBitCount);
    XMLSerializer.dumpAttr(element, "ron", this.rOn);
    XMLSerializer.dumpAttr(element, "rof", this.rOff);
    XMLSerializer.dumpAttr(element, "thr", this.threshold);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    this.selectBitCount = xml.parseIntAttr(
      "sb",
      this.selectBitCount
    );
    super.undumpXml(xml);
    this.rOn = xml.parseDoubleAttr("ron", this.rOn);
    this.rOff = xml.parseDoubleAttr("rof", this.rOff);
    this.threshold = xml.parseDoubleAttr("thr", this.threshold);
  }

  public override stamp(): void {
    for (let index = 0; index < this.inputCount; index += 1) {
      CircuitElm.sim.stampNonLinear(this.nodes[index]);
    }
    CircuitElm.sim.stampNonLinear(this.nodes[this.outputPin]);
  }

  private selectedInput(): number {
    let selected = 0;
    for (let index = 0; index < this.selectBitCount; index += 1) {
      if (this.volts[this.inputCount + index] > this.threshold) {
        selected |= 1 << index;
      }
    }
    return selected;
  }

  public override doStep(): void {
    const selected = this.selectedInput();
    for (let index = 0; index < this.inputCount; index += 1) {
      CircuitElm.sim.stampResistor(
        this.nodes[index],
        this.nodes[this.outputPin],
        index === selected ? this.rOn : this.rOff
      );
    }
  }

  public override calculateCurrent(): void {
    const selected = this.selectedInput();
    let outputCurrent = 0;
    for (let index = 0; index < this.inputCount; index += 1) {
      const resistance =
        index === selected ? this.rOn : this.rOff;
      const current =
        (this.volts[index] - this.volts[this.outputPin]) /
        resistance;
      this.pins[index].current = -current;
      outputCurrent += current;
    }
    this.pins[this.outputPin].current = outputCurrent;
    for (let index = 0; index < this.selectBitCount; index += 1) {
      this.pins[this.inputCount + index].current = 0;
    }
  }

  public override getConnection(first: number, second: number): boolean {
    const firstIsSelect =
      first >= this.inputCount && first < this.outputPin;
    const secondIsSelect =
      second >= this.inputCount && second < this.outputPin;
    return !firstIsSelect && !secondIsSelect;
  }
}
