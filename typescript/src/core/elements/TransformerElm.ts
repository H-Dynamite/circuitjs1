import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Inductor } from "./Inductor";

/** Two-winding transformer, including coupling and optional core saturation. */
export class TransformerElm extends CircuitElm {
  public static readonly FLAG_REVERSE = 4;
  public static readonly FLAG_VERTICAL = 8;
  public static readonly FLAG_FLIP = 16;

  public inductance = 4;
  public ratio = 1;
  public couplingCoef = 0.999;
  public saturationCurrent = 0;
  public width = 32;
  public polarity = 1;
  public flip = 1;
  public currents = [0, 0];
  public ptEnds: Point[] = [];
  public ptCoil: Point[] = [];
  public ptCore: Point[] = [];
  public a1 = 0;
  public a2 = 0;
  public a3 = 0;
  public a4 = 0;
  public curSourceValue1 = 0;
  public curSourceValue2 = 0;

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
    this.width = this.hasFlag(TransformerElm.FLAG_VERTICAL)
      ? -Math.max(32, Math.abs(x2 - x))
      : Math.max(32, Math.abs(y2 - y));
    if (tokenizer?.hasMoreTokens()) {
      this.inductance = Number(tokenizer.nextToken());
      this.ratio = Number(tokenizer.nextToken());
      this.currents[0] = Number(tokenizer.nextToken());
      this.currents[1] = Number(tokenizer.nextToken());
      if (tokenizer.hasMoreTokens()) {
        this.couplingCoef = Number(tokenizer.nextToken());
      }
      if (tokenizer.hasMoreTokens()) {
        this.saturationCurrent = Number(tokenizer.nextToken());
      }
    }
    this.noDiagonal = true;
    this.polarity = this.hasFlag(TransformerElm.FLAG_REVERSE) ? -1 : 1;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return "T".charCodeAt(0);
  }

  public override getPostCount(): number {
    return 4;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.inductance} ${this.ratio} ` +
      `${this.currents[0]} ${this.currents[1]} ` +
      `${this.couplingCoef} ${this.saturationCurrent}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "in", this.inductance);
    XMLSerializer.dumpAttr(element, "ra", this.ratio);
    XMLSerializer.dumpAttr(element, "co", this.couplingCoef);
    XMLSerializer.dumpAttr(element, "wi", this.width);
    if (this.saturationCurrent !== 0) {
      XMLSerializer.dumpAttr(element, "isat", this.saturationCurrent);
    }
    XMLSerializer.dumpAttr(element, "c0", this.currents[0]);
    XMLSerializer.dumpAttr(element, "c1", this.currents[1]);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.inductance = xml.parseDoubleAttr("in", this.inductance);
    this.ratio = xml.parseDoubleAttr("ra", this.ratio);
    this.couplingCoef = xml.parseDoubleAttr("co", this.couplingCoef);
    this.width = xml.parseIntAttr("wi", this.width);
    this.saturationCurrent = xml.parseDoubleAttr("isat", 0);
    this.currents[0] = xml.parseDoubleAttr("c0", 0);
    this.currents[1] = xml.parseDoubleAttr("c1", 0);
    this.polarity = this.hasFlag(TransformerElm.FLAG_REVERSE) ? -1 : 1;
  }

  public override setPoints(): void {
    super.setPoints();
    if (this.hasFlag(TransformerElm.FLAG_VERTICAL)) {
      this.point2.x = this.point1.x;
    } else {
      this.point2.y = this.point1.y;
    }
    this.ptEnds = this.newPointArray(4);
    this.ptCoil = this.newPointArray(4);
    this.ptCore = this.newPointArray(4);
    this.ptEnds[0] = this.point1;
    this.ptEnds[1] = this.point2;
    this.flip = this.hasFlag(TransformerElm.FLAG_FLIP) ? -1 : 1;
    this.interpPoint(
      this.point1,
      this.point2,
      this.ptEnds[2],
      0,
      -this.dsign * this.width * this.flip
    );
    this.interpPoint(
      this.point1,
      this.point2,
      this.ptEnds[3],
      1,
      -this.dsign * this.width * this.flip
    );
    const distance = Math.max(this.dn, 1);
    const coilEnd = 0.5 - 12 / distance;
    const coreEnd = 0.5 - 2 / distance;
    for (let index = 0; index < 4; index += 2) {
      this.interpPoint(
        this.ptEnds[index],
        this.ptEnds[index + 1],
        this.ptCoil[index],
        coilEnd
      );
      this.interpPoint(
        this.ptEnds[index],
        this.ptEnds[index + 1],
        this.ptCoil[index + 1],
        1 - coilEnd
      );
      this.interpPoint(
        this.ptEnds[index],
        this.ptEnds[index + 1],
        this.ptCore[index],
        coreEnd
      );
      this.interpPoint(
        this.ptEnds[index],
        this.ptEnds[index + 1],
        this.ptCore[index + 1],
        1 - coreEnd
      );
    }
    if (this.polarity === -1) {
      [this.ptEnds[1], this.ptEnds[3]] = [this.ptEnds[3], this.ptEnds[1]];
      [this.ptCoil[1], this.ptCoil[3]] = [this.ptCoil[3], this.ptCoil[1]];
    }
  }

  public override getPost(index: number): Point {
    return this.ptEnds[index] ?? this.point1;
  }

  public override reset(): void {
    this.currents.fill(0);
    this.volts.fill(0);
    this.curSourceValue1 = 0;
    this.curSourceValue2 = 0;
  }

  public override nonLinear(): boolean {
    return this.saturationCurrent > 0;
  }

  public isTrapezoidal(): boolean {
    return (this.flags & Inductor.FLAG_BACK_EULER) === 0;
  }

  public calcEffectiveInductance(
    inductance: number,
    current: number,
    saturationCurrent: number
  ): number {
    if (saturationCurrent <= 0) return inductance;
    const ratio = current / saturationCurrent;
    return inductance / (1 + ratio * ratio);
  }

  public computeCoefficients(l1: number, l2: number, mutual: number): void {
    const inverseDeterminant = 1 / (l1 * l2 - mutual * mutual);
    const timeScale = this.isTrapezoidal()
      ? CircuitElm.sim.timeStep / 2
      : CircuitElm.sim.timeStep;
    this.a1 = l2 * inverseDeterminant * timeScale;
    this.a2 = -mutual * inverseDeterminant * timeScale;
    this.a3 = this.a2;
    this.a4 = l1 * inverseDeterminant * timeScale;
  }

  public override stamp(): void {
    const l1 = this.inductance;
    const l2 = this.inductance * this.ratio * this.ratio;
    const mutual = this.couplingCoef * Math.sqrt(l1 * l2);
    this.computeCoefficients(l1, l2, mutual);
    if (this.saturationCurrent > 0) {
      for (const node of this.nodes) CircuitElm.sim.stampNonLinear(node);
    } else {
      this.stampConductanceMatrix();
    }
    for (const node of this.nodes) CircuitElm.sim.stampRightSide(node);
  }

  private stampConductanceMatrix(): void {
    CircuitElm.sim.stampConductance(this.nodes[0], this.nodes[2], this.a1);
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[0],
      this.nodes[2],
      this.nodes[1],
      this.nodes[3],
      this.a2
    );
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[1],
      this.nodes[3],
      this.nodes[0],
      this.nodes[2],
      this.a3
    );
    CircuitElm.sim.stampConductance(this.nodes[1], this.nodes[3], this.a4);
  }

  public override startIteration(): void {
    if (this.saturationCurrent > 0) {
      const l1 = this.calcEffectiveInductance(
        this.inductance,
        this.currents[0],
        this.saturationCurrent
      );
      const l2 = this.calcEffectiveInductance(
        this.inductance * this.ratio * this.ratio,
        this.currents[1],
        this.saturationCurrent * this.ratio
      );
      this.computeCoefficients(
        l1,
        l2,
        this.couplingCoef * Math.sqrt(l1 * l2)
      );
    }
    const voltage1 = this.volts[0] - this.volts[2];
    const voltage2 = this.volts[1] - this.volts[3];
    if (this.isTrapezoidal()) {
      this.curSourceValue1 =
        voltage1 * this.a1 + voltage2 * this.a2 + this.currents[0];
      this.curSourceValue2 =
        voltage1 * this.a3 + voltage2 * this.a4 + this.currents[1];
    } else {
      this.curSourceValue1 = this.currents[0];
      this.curSourceValue2 = this.currents[1];
    }
  }

  public override doStep(): void {
    if (this.saturationCurrent > 0) this.stampConductanceMatrix();
    CircuitElm.sim.stampCurrentSource(
      this.nodes[0],
      this.nodes[2],
      this.curSourceValue1
    );
    CircuitElm.sim.stampCurrentSource(
      this.nodes[1],
      this.nodes[3],
      this.curSourceValue2
    );
  }

  public override calculateCurrent(): void {
    const voltage1 = this.volts[0] - this.volts[2];
    const voltage2 = this.volts[1] - this.volts[3];
    this.currents[0] =
      voltage1 * this.a1 + voltage2 * this.a2 + this.curSourceValue1;
    this.currents[1] =
      voltage1 * this.a3 + voltage2 * this.a4 + this.curSourceValue2;
  }

  public override getCurrentIntoNode(index: number): number {
    return index < 2 ? -this.currents[index] : this.currents[index - 2];
  }

  public override getConnection(first: number, second: number): boolean {
    return (
      this.comparePair(first, second, 0, 2) ||
      this.comparePair(first, second, 1, 3)
    );
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }
}
