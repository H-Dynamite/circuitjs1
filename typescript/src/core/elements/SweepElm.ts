import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Linear/logarithmic swept sine source. */
export class SweepElm extends CircuitElm {
  public static readonly FLAG_LOG = 1;
  public static readonly FLAG_BIDIR = 2;

  public maxV = 5;
  public maxF = 4000;
  public minF = 20;
  public sweepTime = 0.1;
  public frequency = 20;
  public fadd = 0;
  public fmul = 1;
  public freqTime = 0;
  public savedTimeStep = 0;
  public direction = 1;
  public voltage = 0;

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
    flags = SweepElm.FLAG_BIDIR,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    const targets: Array<keyof SweepElm> = [
      "minF",
      "maxF",
      "maxV",
      "sweepTime"
    ];
    for (const target of targets) {
      if (!tokenizer?.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) {
        (this[target] as number) = value;
      }
    }
    this.reset();
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 170;
  }

  public override getXmlDumpType(): string {
    return "sw";
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.minF} ${this.maxF} ${this.maxV} ` +
      `${this.sweepTime}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "mi", this.minF);
    XMLSerializer.dumpAttr(element, "ma", this.maxF);
    XMLSerializer.dumpAttr(element, "mv", this.maxV);
    XMLSerializer.dumpAttr(element, "sw", this.sweepTime);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.minF = xml.parseDoubleAttr("mi", this.minF);
    this.maxF = xml.parseDoubleAttr("ma", this.maxF);
    this.maxV = xml.parseDoubleAttr("mv", this.maxV);
    this.sweepTime = xml.parseDoubleAttr("sw", this.sweepTime);
    this.reset();
  }

  public override getPostCount(): number {
    return 1;
  }

  public override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      this.dn === 0 ? 1 : 1 - 17 / this.dn
    );
  }

  public override setVoltageSource(
    _index: number,
    source: VoltageSource
  ): void {
    this.voltSource = source;
    source.setNodes(CircuitNode.ground, this.nodes[0]);
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override stamp(): void {
    if (this.voltSource === null) {
      throw new Error("Sweep voltage source has not been assigned");
    }
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[0],
      this.voltSource
    );
  }

  public override reset(): void {
    this.frequency = this.minF;
    this.freqTime = 0;
    this.direction = 1;
    this.setParams();
  }

  public setParams(): void {
    if (
      !Number.isFinite(this.frequency) ||
      this.frequency < this.minF ||
      this.frequency > this.maxF
    ) {
      this.frequency = this.minF;
      this.freqTime = 0;
      this.direction = 1;
    }
    if (!this.hasFlag(SweepElm.FLAG_LOG)) {
      this.fadd =
        (this.direction *
          CircuitElm.sim.timeStep *
          (this.maxF - this.minF)) /
        Math.max(this.sweepTime, Number.EPSILON);
      this.fmul = 1;
    } else {
      this.fadd = 0;
      this.fmul = Math.pow(
        this.maxF / Math.max(this.minF, Number.EPSILON),
        (this.direction * CircuitElm.sim.timeStep) /
          Math.max(this.sweepTime, Number.EPSILON)
      );
    }
    this.savedTimeStep = CircuitElm.sim.timeStep;
  }

  public override startIteration(): void {
    if (CircuitElm.sim.timeStep !== this.savedTimeStep) {
      this.setParams();
    }
    this.voltage = Math.sin(this.freqTime) * this.maxV;
    this.freqTime +=
      this.frequency * 2 * Math.PI * CircuitElm.sim.timeStep;
    this.frequency = this.frequency * this.fmul + this.fadd;
    if (this.frequency >= this.maxF && this.direction === 1) {
      if (this.hasFlag(SweepElm.FLAG_BIDIR)) {
        this.fadd = -this.fadd;
        this.fmul = 1 / this.fmul;
        this.direction = -1;
      } else {
        this.frequency = this.minF;
      }
    }
    if (this.frequency <= this.minF && this.direction === -1) {
      this.fadd = -this.fadd;
      this.fmul = 1 / this.fmul;
      this.direction = 1;
    }
  }

  public override doStep(): void {
    if (this.voltSource === null) {
      throw new Error("Sweep voltage source has not been assigned");
    }
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[0],
      this.voltSource,
      this.voltage
    );
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override hasGroundConnection(_node: number): boolean {
    return true;
  }

  public override getPower(): number {
    return -this.getVoltageDiff() * this.current;
  }
}
