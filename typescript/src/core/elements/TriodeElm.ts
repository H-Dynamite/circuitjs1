import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Vacuum triode nonlinear model ported from TriodeElm.java. */
export class TriodeElm extends CircuitElm {
  public static readonly FLAG_FLIP = 1;
  public static readonly FLAG_DSIGN_FIX = 2;
  public mu = 93;
  public kg1 = 680;
  public readonly gridCurrentResistance = 6000;
  public plateCurrent = 0;
  public gridCurrent = 0;
  public cathodeCurrent = 0;
  private lastV0 = 0;
  private lastV1 = 0;
  private lastV2 = 0;
  private platePost = new Point();
  private cathodePost = new Point();

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
    flags = TriodeElm.FLAG_DSIGN_FIX,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    this.noDiagonal = true;
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.mu = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.kg1 = value;
    }
  }

  public override getDumpType(): number {
    return 173;
  }

  public override getPostCount(): number {
    return 3;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override setPoints(): void {
    super.setPoints();
    let side = this.hasFlag(TriodeElm.FLAG_DSIGN_FIX)
      ? this.dsign
      : 1;
    if (this.hasFlag(TriodeElm.FLAG_FLIP)) side = -side;
    const nearWidth = 8 * side;
    const farWidth = 32 * side;
    const plateNear = this.interpPoint(
      this.point1,
      this.point2,
      1,
      nearWidth
    );
    this.platePost = this.interpPoint(
      this.point1,
      this.point2,
      1,
      farWidth
    );
    this.cathodePost = this.interpPoint(
      this.point2,
      plateNear,
      -farWidth / nearWidth,
      16 * side
    );
  }

  public override getPost(index: number): Point {
    return index === 0
      ? this.platePost
      : index === 1
        ? this.point1
        : this.cathodePost;
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
  }

  public override doStep(): void {
    const values = [...this.volts];
    values[1] = Math.max(
      this.lastV1 - 0.5,
      Math.min(this.lastV1 + 0.5, values[1])
    );
    values[2] = Math.max(
      this.lastV2 - 0.5,
      Math.min(this.lastV2 + 0.5, values[2])
    );
    const vgk = values[1] - values[2];
    const vpk = values[0] - values[2];
    if (
      Math.abs(this.lastV0 - values[0]) > 0.01 ||
      Math.abs(this.lastV1 - values[1]) > 0.01 ||
      Math.abs(this.lastV2 - values[2]) > 0.01
    ) {
      CircuitElm.sim.converged = false;
    }
    [this.lastV0, this.lastV1, this.lastV2] = values;
    let ids = 0;
    let transconductance = 0;
    let outputConductance = 0;
    const effectiveVoltage = vgk + vpk / this.mu;
    this.gridCurrent = 0;
    if (vgk > 0.01) {
      CircuitElm.sim.stampResistor(
        this.nodes[1],
        this.nodes[2],
        this.gridCurrentResistance
      );
      this.gridCurrent = vgk / this.gridCurrentResistance;
    } else {
      CircuitElm.sim.stampResistor(this.nodes[1], this.nodes[2], 1e8);
    }
    if (effectiveVoltage < 0) {
      outputConductance = 1e-8;
      ids = vpk * outputConductance;
    } else {
      ids = Math.pow(effectiveVoltage, 1.5) / this.kg1;
      const derivative =
        (1.5 * Math.sqrt(effectiveVoltage)) / this.kg1;
      outputConductance = derivative;
      transconductance = derivative / this.mu;
    }
    this.plateCurrent = ids;
    this.cathodeCurrent = ids + this.gridCurrent;
    const rightSide =
      -ids + outputConductance * vpk + transconductance * vgk;
    CircuitElm.sim.stampMatrix(
      this.nodes[0], this.nodes[0], outputConductance
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[0],
      this.nodes[2],
      -outputConductance - transconductance
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[0], this.nodes[1], transconductance
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[2], this.nodes[0], -outputConductance
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[2],
      this.nodes[2],
      outputConductance + transconductance
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[2], this.nodes[1], -transconductance
    );
    CircuitElm.sim.stampRightSide(this.nodes[0], rightSide);
    CircuitElm.sim.stampRightSide(this.nodes[2], -rightSide);
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 2) return this.cathodeCurrent;
    if (index === 0) return -this.plateCurrent;
    return -this.gridCurrent;
  }

  public override getCurrent(): number {
    return this.cathodeCurrent;
  }

  public override getVoltageDiff(): number {
    return this.volts[0] - this.volts[2];
  }

  public override getConnection(first: number, second: number): boolean {
    return first !== 1 && second !== 1;
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override dump(): string {
    return `${super.dump()} ${this.mu} ${this.kg1}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "mu", this.mu);
    XMLSerializer.dumpAttr(element, "kg", this.kg1);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.mu = xml.parseDoubleAttr("mu", this.mu);
    this.kg1 = xml.parseDoubleAttr("kg", this.kg1);
  }
}
