import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Tri-state digital buffer with optional bus-width support. */
export class TriStateElm extends CircuitElm {
  public static readonly FLAG_FLIP = 1;
  public static readonly FLAG_FLIP_X = 2;
  public static readonly FLAG_FLIP_Y = 4;

  public resistance = 0.1;
  public rOn = 0.1;
  public rOff = 1e10;
  public rOffGround = 1e8;
  public highVoltage = 5;
  public busWidth = 1;
  public voltageSources: Array<VoltageSource | null> = [];
  public open = false;
  public point3 = new Point();

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
    super(x, y, x2, y2, flags);
    this.noDiagonal = true;
    const keys = ["rOn", "rOff", "rOffGround", "highVoltage"] as const;
    for (const key of keys) {
      if (!tokenizer.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this[key] = value;
    }
    this.allocNodes();
  }

  public controlNode(): number {
    return 2 * this.busWidth;
  }

  public internalNode(bit: number): number {
    return 2 * this.busWidth + 1 + bit;
  }

  public override getDumpType(): number {
    return 180;
  }

  public override getXmlDumpType(): string {
    return "ts";
  }

  public override getPostCount(): number {
    return 2 * this.busWidth + 1;
  }

  public override getInternalNodeCount(): number {
    return this.busWidth;
  }

  public override getVoltageSourceCount(): number {
    return this.busWidth;
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    const sign = this.hasFlag(TriStateElm.FLAG_FLIP) ? 1 : -1;
    this.point3 = this.interpPoint(
      this.lead1,
      this.lead2,
      0.5,
      sign * 16
    );
  }

  public override getPost(index: number): Point {
    if (index < this.busWidth) {
      return new Point(this.point1.x, this.point1.y, index);
    }
    if (index < 2 * this.busWidth) {
      return new Point(
        this.point2.x,
        this.point2.y,
        index - this.busWidth
      );
    }
    return this.point3;
  }

  public override getPostWidth(index: number): number {
    return index < 2 * this.busWidth ? this.busWidth : 1;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    source.setNodes(
      CircuitNode.ground,
      this.nodes[this.internalNode(index)]
    );
  }

  public override stamp(): void {
    for (let bit = 0; bit < this.busWidth; bit += 1) {
      const source = this.voltageSources[bit];
      if (source === null || source === undefined) {
        throw new Error("Tri-state source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[this.internalNode(bit)],
        source
      );
      CircuitElm.sim.stampNonLinear(
        this.nodes[this.internalNode(bit)]
      );
      CircuitElm.sim.stampNonLinear(
        this.nodes[this.busWidth + bit]
      );
    }
  }

  public override doStep(): void {
    this.open =
      this.volts[this.controlNode()] < this.highVoltage * 0.5;
    this.resistance = this.open ? this.rOff : this.rOn;
    for (let bit = 0; bit < this.busWidth; bit += 1) {
      const source = this.voltageSources[bit];
      if (source === null || source === undefined) {
        throw new Error("Tri-state source is unassigned");
      }
      const internal = this.internalNode(bit);
      const output = this.busWidth + bit;
      CircuitElm.sim.stampResistor(
        this.nodes[internal],
        this.nodes[output],
        this.resistance
      );
      if (this.rOffGround > 0) {
        CircuitElm.sim.stampResistor(
          this.nodes[output],
          CircuitNode.ground,
          this.rOffGround
        );
      }
      CircuitElm.sim.updateVoltageSource(
        CircuitNode.ground,
        this.nodes[internal],
        source,
        this.volts[bit] > this.highVoltage * 0.5
          ? this.highVoltage
          : 0
      );
    }
  }

  public override calculateCurrent(): void {
    this.current = 0;
    for (let bit = 0; bit < this.busWidth; bit += 1) {
      const internal = this.internalNode(bit);
      const output = this.busWidth + bit;
      const throughBuffer =
        (this.volts[internal] - this.volts[output]) /
        this.resistance;
      const toGround =
        this.rOffGround === 0
          ? 0
          : this.volts[output] / this.rOffGround;
      this.current += throughBuffer - toGround;
    }
  }

  public override getCurrentIntoNode(index: number): number {
    return index >= this.busWidth && index < 2 * this.busWidth
      ? this.current / this.busWidth
      : 0;
  }

  public override getMatrixConnection(
    first: number,
    second: number
  ): boolean {
    for (let bit = 0; bit < this.busWidth; bit += 1) {
      if (
        this.comparePair(
          first,
          second,
          this.busWidth + bit,
          this.internalNode(bit)
        )
      ) {
        return true;
      }
    }
    return false;
  }

  public override getConnection(_first: number, _second: number): boolean {
    return false;
  }

  public override hasGroundConnection(index: number): boolean {
    return index >= this.busWidth && index < 2 * this.busWidth;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.rOn} ${this.rOff} ` +
      `${this.rOffGround} ${this.highVoltage}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ron", this.rOn);
    XMLSerializer.dumpAttr(element, "roff", this.rOff);
    XMLSerializer.dumpAttr(element, "rog", this.rOffGround);
    XMLSerializer.dumpAttr(element, "hi", this.highVoltage);
    if (this.busWidth !== 1) {
      XMLSerializer.dumpAttr(element, "bw", this.busWidth);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.rOn = xml.parseDoubleAttr("ron", this.rOn);
    this.rOff = xml.parseDoubleAttr("roff", this.rOff);
    this.rOffGround = xml.parseDoubleAttr("rog", this.rOffGround);
    this.highVoltage = xml.parseDoubleAttr("hi", this.highVoltage);
    this.busWidth = xml.parseIntAttr("bw", 1);
    this.allocNodes();
  }
}
