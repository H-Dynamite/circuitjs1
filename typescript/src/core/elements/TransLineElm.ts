import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/**
 * Lossless transmission-line model ported from TransLineElm.java.
 *
 * The two travelling-wave buffers are sampled at the simulation's maximum
 * time step, matching the original discrete-delay implementation.
 */
export class TransLineElm extends CircuitElm {
  public delay = 1000 * CircuitElm.sim.maxTimeStep;
  public imped = 75;
  public width = 32;
  public voltageL: Float64Array | null = null;
  public voltageR: Float64Array | null = null;
  public lenSteps = 1;
  public ptr = 0;
  public posts: Point[] = [];
  public inner: Point[] = [];
  public voltSource1: VoltageSource | null = null;
  public voltSource2: VoltageSource | null = null;
  public current1 = 0;
  public current2 = 0;

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
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      this.delay = Number(tokenizer.nextToken());
    }
    if (tokenizer?.hasMoreTokens()) {
      this.imped = Number(tokenizer.nextToken());
    }
    if (tokenizer?.hasMoreTokens()) {
      this.width = Number.parseInt(tokenizer.nextToken(), 10);
    }
    // The fourth legacy argument is reserved for line loss.
    if (tokenizer?.hasMoreTokens()) tokenizer.nextToken();
    this.noDiagonal = true;
    this.allocNodes();
    this.reset();
  }

  public override getDumpType(): number {
    return 171;
  }

  public override getXmlDumpType(): string {
    return "tl";
  }

  public override getPostCount(): number {
    return 4;
  }

  public override getInternalNodeCount(): number {
    return 2;
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override dump(): string {
    return `${super.dump()} ${this.delay} ${this.imped} ${this.width} 0`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "de", this.delay);
    XMLSerializer.dumpAttr(element, "im", this.imped);
    XMLSerializer.dumpAttr(element, "wi", this.width);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.delay = xml.parseDoubleAttr("de", this.delay);
    this.imped = xml.parseDoubleAttr("im", this.imped);
    this.width = xml.parseIntAttr("wi", this.width);
    this.reset();
  }

  public override reset(): void {
    const timeStep = CircuitElm.sim.maxTimeStep;
    if (!(timeStep > 0)) return;
    this.lenSteps = Math.max(1, Math.floor(this.delay / timeStep));
    if (this.lenSteps > 100000) {
      this.voltageL = null;
      this.voltageR = null;
    } else {
      this.voltageL = new Float64Array(this.lenSteps);
      this.voltageR = new Float64Array(this.lenSteps);
    }
    this.ptr = 0;
    super.reset();
  }

  public override setPoints(): void {
    super.setPoints();
    const direction = this.dy === 0 ? CircuitElm.sign(this.dx) : -CircuitElm.sign(this.dy);
    const p3 = this.interpPoint(this.point1, this.point2, 0, -this.width * direction);
    const p4 = this.interpPoint(this.point1, this.point2, 1, -this.width * direction);
    const separation = 8;
    const p5 = this.interpPoint(
      this.point1,
      this.point2,
      0,
      -(this.width / 2 - separation) * direction
    );
    const p6 = this.interpPoint(
      this.point1,
      this.point2,
      1,
      -(this.width / 2 - separation) * direction
    );
    const p7 = this.interpPoint(
      this.point1,
      this.point2,
      0,
      -(this.width / 2 + separation) * direction
    );
    const p8 = this.interpPoint(
      this.point1,
      this.point2,
      1,
      -(this.width / 2 + separation) * direction
    );
    this.posts = [p3, p4, this.point1, this.point2];
    this.inner = [p7, p8, p5, p6];
  }

  public override getPost(index: number): Point {
    return this.posts[index] ?? this.point1;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    if (index === 0) {
      this.voltSource1 = source;
      source.setNodes(this.nodes[4], this.nodes[0]);
    } else {
      this.voltSource2 = source;
      source.setNodes(this.nodes[5], this.nodes[1]);
    }
  }

  public override setCurrent(source: VoltageSource, current: number): void {
    if (source === this.voltSource1) this.current1 = current;
    else if (source === this.voltSource2) this.current2 = current;
  }

  public override stamp(): void {
    if (this.voltSource1 === null || this.voltSource2 === null) {
      throw new Error("Transmission line voltage sources are unassigned");
    }
    CircuitElm.sim.stampVoltageSource(
      this.nodes[4],
      this.nodes[0],
      this.voltSource1
    );
    CircuitElm.sim.stampVoltageSource(
      this.nodes[5],
      this.nodes[1],
      this.voltSource2
    );
    CircuitElm.sim.stampResistor(this.nodes[2], this.nodes[4], this.imped);
    CircuitElm.sim.stampResistor(this.nodes[3], this.nodes[5], this.imped);
  }

  public override startIteration(): void {
    if (this.voltageL === null || this.voltageR === null) return;
    this.voltageL[this.ptr] =
      this.volts[2] - this.volts[0] + this.volts[2] - this.volts[4];
    this.voltageR[this.ptr] =
      this.volts[3] - this.volts[1] + this.volts[3] - this.volts[5];
  }

  public override doStep(): void {
    if (
      this.voltageL === null ||
      this.voltageR === null ||
      this.voltSource1 === null ||
      this.voltSource2 === null
    ) {
      return;
    }
    const nextPtr = (this.ptr + 1) % this.lenSteps;
    CircuitElm.sim.updateVoltageSource(
      this.nodes[4],
      this.nodes[0],
      this.voltSource1,
      -this.voltageR[nextPtr]
    );
    CircuitElm.sim.updateVoltageSource(
      this.nodes[5],
      this.nodes[1],
      this.voltSource2,
      -this.voltageL[nextPtr]
    );
  }

  public override stepFinished(): void {
    if (this.voltageL !== null) {
      this.ptr = (this.ptr + 1) % this.lenSteps;
    }
  }

  public override hasGroundConnection(_index: number): boolean {
    return false;
  }

  public override getConnection(_first: number, _second: number): boolean {
    return false;
  }

  public override getMatrixConnection(first: number, second: number): boolean {
    return first % 2 === second % 2;
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 0) return this.current1;
    if (index === 2) return -this.current1;
    if (index === 3) return -this.current2;
    return this.current2;
  }
}
