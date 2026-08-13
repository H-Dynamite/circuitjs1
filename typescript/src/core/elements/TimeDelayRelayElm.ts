import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Four-terminal relay with independent on/off delays. */
export class TimeDelayRelayElm extends ChipElm {
  public readonly vinResistance = 10e3;
  public lastTransition = 0;
  public poweredState = false;
  public onState = false;
  public resistance = 10e6;
  public onDelay = 1;
  public offDelay = 0;
  public onResistance = 1;
  public offResistance = 10e6;

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
    const values = [
      "onDelay",
      "offDelay",
      "onResistance",
      "offResistance"
    ] as const;
    for (const key of values) {
      if (!tokenizer.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this[key] = value;
    }
    this.resistance = this.offResistance;
    this.setupPins();
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = Array<ChipPin>(4);
    this.pins[0] = new ChipPin(1, ChipElm.SIDE_W, "Vin");
    this.pins[1] = new ChipPin(1, ChipElm.SIDE_E, "gnd");
    this.pins[2] = new ChipPin(0, ChipElm.SIDE_W, "in");
    this.pins[3] = new ChipPin(0, ChipElm.SIDE_E, "out");
    this.allocNodes();
  }

  public override getPostCount(): number {
    return 4;
  }

  public override getVoltageSourceCount(): number {
    return 0;
  }

  public override getDumpType(): number {
    return 414;
  }

  public override getChipName(): string {
    return "time delay relay";
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override reset(): void {
    super.reset();
    this.lastTransition = 0;
    this.poweredState = false;
    this.onState = false;
    this.resistance = this.offResistance;
  }

  public override stamp(): void {
    this.resistance = this.onState
      ? this.onResistance
      : this.offResistance;
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.vinResistance
    );
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
    CircuitElm.sim.stampNonLinear(this.nodes[3]);
  }

  public override doStep(): void {
    this.resistance = this.onState
      ? this.onResistance
      : this.offResistance;
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[3],
      this.resistance
    );
  }

  public override stepFinished(): void {
    const oldState = this.poweredState;
    this.poweredState = this.volts[0] - this.volts[1] > 2.5;
    if (oldState !== this.poweredState) {
      this.lastTransition = CircuitElm.sim.t;
    }
    const delay = this.poweredState ? this.onDelay : this.offDelay;
    if (CircuitElm.sim.t > this.lastTransition + delay) {
      this.onState = this.poweredState;
    }
  }

  public override calculateCurrent(): void {
    this.pins[0].current =
      -(this.volts[0] - this.volts[1]) / this.vinResistance;
    this.pins[2].current =
      -(this.volts[2] - this.volts[3]) / this.resistance;
    this.pins[1].current = -this.pins[0].current;
    this.pins[3].current = -this.pins[2].current;
  }

  public override getCurrentIntoNode(index: number): number {
    return this.pins[index]?.current ?? 0;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.onDelay} ${this.offDelay} ` +
      `${this.onResistance} ${this.offResistance}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ond", this.onDelay);
    XMLSerializer.dumpAttr(element, "ofd", this.offDelay);
    XMLSerializer.dumpAttr(element, "onr", this.onResistance);
    XMLSerializer.dumpAttr(element, "ofr", this.offResistance);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.onDelay = xml.parseDoubleAttr("ond", this.onDelay);
    this.offDelay = xml.parseDoubleAttr("ofd", this.offDelay);
    this.onResistance = xml.parseDoubleAttr(
      "onr",
      this.onResistance
    );
    this.offResistance = xml.parseDoubleAttr(
      "ofr",
      this.offResistance
    );
    this.resistance = this.offResistance;
  }
}
