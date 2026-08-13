import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Inductor } from "./Inductor";

/** Center-tapped coupled transformer ported from TappedTransformerElm.java. */
export class TappedTransformerElm extends CircuitElm {
  public static readonly FLAG_FLIP = 1;
  public inductance = 4;
  public ratio = 1;
  public couplingCoef = 0.99;
  public currents = [0, 0, 0, 0];
  private terminalPoints: Point[] = [];
  private coefficients = Array<number>(9).fill(0);
  private sourceValues = [0, 0, 0];

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
    this.noDiagonal = true;
    const values: number[] = [];
    while (tokenizer?.hasMoreTokens() && values.length < 6) {
      values.push(Number(tokenizer.nextToken()));
    }
    if (Number.isFinite(values[0])) this.inductance = values[0];
    if (Number.isFinite(values[1])) this.ratio = values[1];
    if (Number.isFinite(values[2])) this.currents[0] = values[2];
    if (Number.isFinite(values[3])) this.currents[1] = values[3];
    if (Number.isFinite(values[4])) this.currents[2] = values[4];
    if (Number.isFinite(values[5])) this.couplingCoef = values[5];
  }

  public override getDumpType(): number {
    return 169;
  }

  public override getXmlDumpType(): string {
    return "tt";
  }

  public override getPostCount(): number {
    return 5;
  }

  public override setPoints(): void {
    super.setPoints();
    const height = 32 * (this.hasFlag(TappedTransformerElm.FLAG_FLIP) ? -1 : 1);
    this.terminalPoints = [
      this.point1,
      this.interpPoint(this.point1, this.point2, 0, -height * 2),
      this.point2,
      this.interpPoint(this.point1, this.point2, 1, -height),
      this.interpPoint(this.point1, this.point2, 1, -height * 2)
    ];
  }

  public override getPost(index: number): Point {
    return this.terminalPoints[index] ?? this.point1;
  }

  public override stamp(): void {
    const l1 = this.inductance;
    const l2 = (this.inductance * this.ratio * this.ratio) / 4;
    const mutual1 = this.couplingCoef * Math.sqrt(l1 * l2);
    const mutual2 = this.couplingCoef * l2;
    const a = this.coefficients;
    a[0] = l2 + mutual2;
    a[1] = a[2] = a[3] = a[6] = -mutual1;
    a[4] = a[8] =
      (l1 * l2 - mutual1 * mutual1) / (l2 - mutual2);
    a[5] = a[7] =
      (mutual1 * mutual1 - l1 * mutual2) / (l2 - mutual2);
    const determinant = l1 * (l2 + mutual2) - 2 * mutual1 * mutual1;
    const multiplier =
      ((this.flags & Inductor.FLAG_BACK_EULER) === 0
        ? CircuitElm.sim.timeStep / 2
        : CircuitElm.sim.timeStep) / determinant;
    for (let index = 0; index < 9; index += 1) a[index] *= multiplier;
    CircuitElm.sim.stampConductance(this.nodes[0], this.nodes[1], a[0]);
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[0], this.nodes[1], this.nodes[2], this.nodes[3], a[1]
    );
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[0], this.nodes[1], this.nodes[3], this.nodes[4], a[2]
    );
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[2], this.nodes[3], this.nodes[0], this.nodes[1], a[3]
    );
    CircuitElm.sim.stampConductance(this.nodes[2], this.nodes[3], a[4]);
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[2], this.nodes[3], this.nodes[3], this.nodes[4], a[5]
    );
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[3], this.nodes[4], this.nodes[0], this.nodes[1], a[6]
    );
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[3], this.nodes[4], this.nodes[2], this.nodes[3], a[7]
    );
    CircuitElm.sim.stampConductance(this.nodes[3], this.nodes[4], a[8]);
    for (const node of this.nodes) CircuitElm.sim.stampRightSide(node);
  }

  public override startIteration(): void {
    const voltages = [
      this.volts[0] - this.volts[1],
      this.volts[2] - this.volts[3],
      this.volts[3] - this.volts[4]
    ];
    for (let row = 0; row < 3; row += 1) {
      this.sourceValues[row] = this.currents[row];
      if ((this.flags & Inductor.FLAG_BACK_EULER) === 0) {
        for (let column = 0; column < 3; column += 1) {
          this.sourceValues[row] +=
            this.coefficients[row * 3 + column] * voltages[column];
        }
      }
    }
  }

  public override doStep(): void {
    CircuitElm.sim.stampCurrentSource(
      this.nodes[0], this.nodes[1], this.sourceValues[0]
    );
    CircuitElm.sim.stampCurrentSource(
      this.nodes[2], this.nodes[3], this.sourceValues[1]
    );
    CircuitElm.sim.stampCurrentSource(
      this.nodes[3], this.nodes[4], this.sourceValues[2]
    );
  }

  public override calculateCurrent(): void {
    const voltages = [
      this.volts[0] - this.volts[1],
      this.volts[2] - this.volts[3],
      this.volts[3] - this.volts[4]
    ];
    for (let row = 0; row < 3; row += 1) {
      this.currents[row] = this.sourceValues[row];
      for (let column = 0; column < 3; column += 1) {
        this.currents[row] +=
          this.coefficients[row * 3 + column] * voltages[column];
      }
    }
    this.currents[3] = this.currents[1] - this.currents[2];
    this.current = this.currents[0];
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 0) return -this.currents[0];
    if (index === 1) return this.currents[0];
    if (index === 2) return -this.currents[1];
    if (index === 3) return this.currents[3];
    return this.currents[2];
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.inductance} ${this.ratio} ` +
      `${this.currents[0]} ${this.currents[1]} ${this.currents[2]} ` +
      `${this.couplingCoef}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "in", this.inductance);
    XMLSerializer.dumpAttr(element, "ra", this.ratio);
    XMLSerializer.dumpAttr(element, "co", this.couplingCoef);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.inductance = xml.parseDoubleAttr("in", this.inductance);
    this.ratio = xml.parseDoubleAttr("ra", this.ratio);
    this.couplingCoef = xml.parseDoubleAttr("co", this.couplingCoef);
    this.currents[0] = xml.parseDoubleAttr("c0", 0);
    this.currents[1] = xml.parseDoubleAttr("c1", 0);
    this.currents[2] = xml.parseDoubleAttr("c2", 0);
  }
}
