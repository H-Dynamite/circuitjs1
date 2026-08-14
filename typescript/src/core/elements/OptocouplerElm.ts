import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Diode } from "./Diode";

/**
 * Four-terminal optocoupler behavior model.
 *
 * It retains the LED junction and isolated CTR transfer behavior of the Java
 * composite while avoiding a hidden legacy/GWT subcircuit dependency.
 */
export class OptocouplerElm extends CircuitElm {
  public ctr = 1;
  public led: Diode;
  public ledCurrent = 0;
  public outputCurrent = 0;
  public posts: Point[] = [];

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
    if (tokenizer.hasMoreTokens()) {
      const ctr = Number(tokenizer.nextToken());
      if (Number.isFinite(ctr)) this.ctr = ctr;
    }
    this.led = new Diode(CircuitElm.sim);
    this.led.setupForDefaultModel();
    this.noDiagonal = true;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 407;
  }

  public override getPostCount(): number {
    return 4;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override setPoints(): void {
    super.setPoints();
    const separation = 16;
    this.posts = [
      this.interpPoint(this.point1, this.point2, 0, -separation),
      this.interpPoint(this.point1, this.point2, 0, separation),
      this.interpPoint(this.point1, this.point2, 1, -separation),
      this.interpPoint(this.point1, this.point2, 1, separation)
    ];
  }

  public override getPost(index: number): Point {
    return this.posts[index] ?? this.point1;
  }

  public override reset(): void {
    super.reset();
    this.led.reset();
    this.ledCurrent = 0;
    this.outputCurrent = 0;
  }

  public override stamp(): void {
    this.led.stamp(this.nodes[0], this.nodes[1]);
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
    CircuitElm.sim.stampNonLinear(this.nodes[3]);
  }

  public override doStep(): void {
    this.led.doStep(this.volts[0] - this.volts[1]);
    this.outputCurrent = Math.max(0, this.ledCurrent) * this.ctr;
    CircuitElm.sim.stampCurrentSource(
      this.nodes[2],
      this.nodes[3],
      this.outputCurrent
    );
    // A finite off-state path models phototransistor leakage and keeps a
    // completely open collector/emitter pair numerically well-defined.
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[3],
      1e10
    );
  }

  public override calculateCurrent(): void {
    this.ledCurrent = this.led.calculateCurrent(
      this.volts[0] - this.volts[1]
    );
    this.outputCurrent = Math.max(0, this.ledCurrent) * this.ctr;
    this.current = this.outputCurrent;
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 0) return -this.ledCurrent;
    if (index === 1) return this.ledCurrent;
    if (index === 2) return -this.outputCurrent;
    return this.outputCurrent;
  }

  public override getConnection(first: number, second: number): boolean {
    return Math.floor(first / 2) === Math.floor(second / 2);
  }

  // The Java model allows independent X/Y flips but not an axis-exchange
  // Flip XY: its four terminal roles would no longer preserve their layout.
  public override canFlipXY(): boolean {
    return false;
  }

  public override dump(): string {
    return `${super.dump()} ${this.ctr}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ctr", this.ctr);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.ctr = xml.parseDoubleAttr("ctr", this.ctr);
  }
}
