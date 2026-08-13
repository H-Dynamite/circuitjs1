import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Diode } from "./Diode";

/** Nonlinear electrical and topology port of MosfetElm.java. */
export class MosfetElm extends CircuitElm {
  public static readonly FLAG_PNP = 1;
  public static readonly FLAG_SHOWVT = 2;
  public static readonly FLAG_DIGITAL = 4;
  public static readonly FLAG_FLIP = 8;
  public static readonly FLAG_HIDE_BULK = 16;
  public static readonly FLAG_BODY_DIODE = 32;
  public static readonly FLAG_BODY_TERMINAL = 64;
  public static readonly FLAG_SHOW_BODY_DIODE = 128;
  public static readonly FLAGS_GLOBAL =
    MosfetElm.FLAG_HIDE_BULK |
    MosfetElm.FLAG_DIGITAL |
    MosfetElm.FLAG_SHOW_BODY_DIODE;
  public static globalFlags = 0;
  public static lastBeta = 0;

  public pnp: number;
  public bodyTerminal = 0;
  public vt: number;
  public beta: number;
  public readonly diodeB1: Diode;
  public readonly diodeB2: Diode;
  public diodeCurrent1 = 0;
  public diodeCurrent2 = 0;
  public bodyCurrent = 0;
  public lastv0 = 0;
  public lastv1 = 0;
  public lastv2 = 0;
  public ids = 0;
  public mode = 0;
  public gm = 0;
  public src: Point[] = [];
  public drn: Point[] = [];
  public gate: Point[] = [];
  public body: Point[] = [];
  public pcircle = new Point();
  public pcircler = 0;

  public constructor(x: number, y: number, pnp: boolean);
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
    x2OrPnp: number | boolean,
    y2?: number,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    const interactive = typeof x2OrPnp === "boolean";
    super(
      x,
      y,
      interactive ? x : x2OrPnp,
      interactive ? y : (y2 ?? y),
      interactive ? 0 : flags
    );
    const pnpFlag =
      interactive
        ? x2OrPnp
        : (this.flags & MosfetElm.FLAG_PNP) !== 0;
    this.pnp = pnpFlag ? -1 : 1;
    if (interactive) {
      this.flags =
        (pnpFlag ? MosfetElm.FLAG_PNP : 0) |
        MosfetElm.FLAG_BODY_DIODE;
    }
    this.noDiagonal = true;
    this.diodeB1 = new Diode(CircuitElm.sim);
    this.diodeB2 = new Diode(CircuitElm.sim);
    this.diodeB1.setupForDefaultModel();
    this.diodeB2.setupForDefaultModel();
    this.vt = this.getDefaultThreshold();
    this.beta = interactive
      ? this.getDefaultBeta()
      : this.getBackwardCompatibilityBeta();
    if (tokenizer !== undefined) {
      if (tokenizer.hasMoreTokens()) {
        this.vt = Number(tokenizer.nextToken());
      }
      if (tokenizer.hasMoreTokens()) {
        this.beta = Number(tokenizer.nextToken());
      }
      MosfetElm.globalFlags = this.flags & MosfetElm.FLAGS_GLOBAL;
    }
    this.allocNodes();
  }

  public getDefaultThreshold(): number {
    return 1.5;
  }

  public getDefaultBeta(): number {
    return MosfetElm.lastBeta === 0
      ? this.getBackwardCompatibilityBeta()
      : MosfetElm.lastBeta;
  }

  public getBackwardCompatibilityBeta(): number {
    return 0.02;
  }

  public override getDumpType(): number {
    return "f".charCodeAt(0);
  }

  public override nonLinear(): boolean {
    return true;
  }

  public drawDigital(): boolean {
    return this.hasFlag(MosfetElm.FLAG_DIGITAL);
  }

  public showBulk(): boolean {
    return (
      (this.flags &
        (MosfetElm.FLAG_DIGITAL | MosfetElm.FLAG_HIDE_BULK)) ===
      0
    );
  }

  public hasBodyTerminal(): boolean {
    return (
      this.hasFlag(MosfetElm.FLAG_BODY_TERMINAL) &&
      this.doBodyDiode()
    );
  }

  public doBodyDiode(): boolean {
    return this.hasFlag(MosfetElm.FLAG_BODY_DIODE) && this.showBulk();
  }

  public showBodyDiode(): boolean {
    return (
      this.hasFlag(MosfetElm.FLAG_SHOW_BODY_DIODE) &&
      this.doBodyDiode()
    );
  }

  public override reset(): void {
    this.lastv0 = 0;
    this.lastv1 = 0;
    this.lastv2 = 0;
    this.volts.fill(0);
    this.curcount = 0;
    this.diodeCurrent1 = 0;
    this.diodeCurrent2 = 0;
    this.diodeB1.reset();
    this.diodeB2.reset();
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "vt", this.vt);
    XMLSerializer.dumpAttr(element, "be", this.beta);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    this.flags = 0;
    super.undumpXml(xml);
    this.vt = xml.parseDoubleAttr("vt", this.vt);
    this.beta = xml.parseDoubleAttr("be", this.beta);
    MosfetElm.globalFlags = this.flags & MosfetElm.FLAGS_GLOBAL;
    this.pnp = this.hasFlag(MosfetElm.FLAG_PNP) ? -1 : 1;
    this.allocNodes();
  }

  public override getPostCount(): number {
    return this.hasBodyTerminal() ? 4 : 3;
  }

  public override getPost(index: number): Point {
    if (index === 0) {
      return this.point1;
    }
    if (index === 1) {
      return this.src[0] ?? this.point2;
    }
    if (index === 2) {
      return this.drn[0] ?? this.point2;
    }
    return this.body[0] ?? this.point2;
  }

  public override setPoints(): void {
    this.flags &= ~MosfetElm.FLAGS_GLOBAL;
    this.flags |= MosfetElm.globalFlags;
    super.setPoints();
    let halfSize = 16 * this.dsign;
    if (this.hasFlag(MosfetElm.FLAG_FLIP)) {
      halfSize = -halfSize;
    }
    this.src = this.newPointArray(3);
    this.drn = this.newPointArray(3);
    this.interpPoint2(
      this.point1,
      this.point2,
      this.src[0],
      this.drn[0],
      1,
      -halfSize
    );
    this.interpPoint2(
      this.point1,
      this.point2,
      this.src[1],
      this.drn[1],
      this.dn === 0 ? 1 : 1 - 22 / this.dn,
      -halfSize
    );
    this.interpPoint2(
      this.point1,
      this.point2,
      this.src[2],
      this.drn[2],
      this.dn === 0 ? 1 : 1 - 22 / this.dn,
      (-halfSize * 4) / 3
    );
    this.gate = this.newPointArray(3);
    this.interpPoint2(
      this.point1,
      this.point2,
      this.gate[0],
      this.gate[2],
      this.dn === 0 ? 1 : 1 - 28 / this.dn,
      halfSize / 2
    );
    this.interpPoint(
      this.gate[0],
      this.gate[2],
      this.gate[1],
      0.5
    );
    if (this.showBulk()) {
      this.body = [
        this.interpPoint(this.src[0], this.drn[0], 0.5),
        this.interpPoint(this.src[1], this.drn[1], 0.5)
      ];
    } else {
      this.body = [];
    }
    this.pcircler = 0;
    if (this.drawDigital() && this.pnp === -1) {
      this.interpPoint(
        this.point1,
        this.point2,
        this.gate[1],
        this.dn === 0 ? 1 : 1 - 36 / this.dn
      );
      const distance = this.dsign < 0 ? 32 : 31;
      this.pcircle = this.interpPoint(
        this.point1,
        this.point2,
        this.dn === 0 ? 1 : 1 - distance / this.dn
      );
      this.pcircler = 3;
    }
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
    this.bodyTerminal = this.hasBodyTerminal()
      ? 3
      : this.pnp === -1
        ? 2
        : 1;

    if (this.doBodyDiode()) {
      if (this.pnp === -1) {
        this.diodeB1.stamp(
          this.nodes[1],
          this.nodes[this.bodyTerminal]
        );
        this.diodeB2.stamp(
          this.nodes[2],
          this.nodes[this.bodyTerminal]
        );
      } else {
        this.diodeB1.stamp(
          this.nodes[this.bodyTerminal],
          this.nodes[1]
        );
        this.diodeB2.stamp(
          this.nodes[this.bodyTerminal],
          this.nodes[2]
        );
      }
    }
  }

  public nonConvergence(last: number, current: number): boolean {
    let difference = Math.abs(last - current);
    if (this.beta > 1) {
      difference *= 100;
    }
    if (difference < 0.01) {
      return false;
    }
    if (
      CircuitElm.sim.subIterations > 10 &&
      difference < Math.abs(current) * 0.001
    ) {
      return false;
    }
    return !(
      CircuitElm.sim.subIterations > 100 &&
      difference <
        0.01 + (CircuitElm.sim.subIterations - 100) * 0.0001
    );
  }

  public override doStep(): void {
    this.calculate(false);
  }

  public override stepFinished(): void {
    this.calculate(true);
    if (this.bodyTerminal === 1) {
      this.diodeCurrent1 = -this.diodeCurrent2;
    }
    if (this.bodyTerminal === 2) {
      this.diodeCurrent2 = -this.diodeCurrent1;
    }
  }

  public calculate(finished: boolean): void {
    const voltages = finished
      ? this.volts
      : [this.volts[0], this.volts[1], this.volts[2]];
    if (!finished) {
      voltages[1] = Math.max(
        this.lastv1 - 0.5,
        Math.min(this.lastv1 + 0.5, voltages[1])
      );
      voltages[2] = Math.max(
        this.lastv2 - 0.5,
        Math.min(this.lastv2 + 0.5, voltages[2])
      );
    }

    let source = 1;
    let drain = 2;
    if (this.pnp * voltages[1] > this.pnp * voltages[2]) {
      source = 2;
      drain = 1;
    }
    const gate = 0;
    let vgs = voltages[gate] - voltages[source];
    let vds = voltages[drain] - voltages[source];
    if (
      !finished &&
      (this.nonConvergence(this.lastv1, voltages[1]) ||
        this.nonConvergence(this.lastv2, voltages[2]) ||
        this.nonConvergence(this.lastv0, voltages[0]))
    ) {
      CircuitElm.sim.converged = false;
    }
    this.lastv0 = voltages[0];
    this.lastv1 = voltages[1];
    this.lastv2 = voltages[2];
    const realVgs = vgs;
    const realVds = vds;
    vgs *= this.pnp;
    vds *= this.pnp;

    this.ids = 0;
    this.gm = 0;
    let drainConductance = 0;
    if (vgs < this.vt) {
      drainConductance = 1e-8;
      this.ids = vds * drainConductance;
      this.mode = 0;
    } else if (vds < vgs - this.vt) {
      this.ids =
        this.beta * ((vgs - this.vt) * vds - (vds * vds) / 2);
      this.gm = this.beta * vds;
      drainConductance = this.beta * (vgs - vds - this.vt);
      this.mode = 1;
    } else {
      this.gm = this.beta * (vgs - this.vt);
      drainConductance = 1e-8;
      this.ids =
        0.5 * this.beta * (vgs - this.vt) ** 2 +
        (vds - (vgs - this.vt)) * drainConductance;
      this.mode = 2;
    }

    if (this.doBodyDiode()) {
      this.diodeB1.doStep(
        this.pnp *
          (this.volts[this.bodyTerminal] - this.volts[1])
      );
      this.diodeCurrent1 =
        this.diodeB1.calculateCurrent(
          this.pnp *
            (this.volts[this.bodyTerminal] - this.volts[1])
        ) * this.pnp;
      this.diodeB2.doStep(
        this.pnp *
          (this.volts[this.bodyTerminal] - this.volts[2])
      );
      this.diodeCurrent2 =
        this.diodeB2.calculateCurrent(
          this.pnp *
            (this.volts[this.bodyTerminal] - this.volts[2])
        ) * this.pnp;
    } else {
      this.diodeCurrent1 = 0;
      this.diodeCurrent2 = 0;
    }

    const originalIds = this.ids;
    if (
      (source === 2 && this.pnp === 1) ||
      (source === 1 && this.pnp === -1)
    ) {
      this.ids = -this.ids;
    }
    if (finished) {
      return;
    }

    const rightSide =
      -this.pnp * originalIds +
      drainConductance * realVds +
      this.gm * realVgs;
    CircuitElm.sim.stampMatrix(
      this.nodes[drain],
      this.nodes[drain],
      drainConductance
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[drain],
      this.nodes[source],
      -drainConductance - this.gm
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[drain],
      this.nodes[gate],
      this.gm
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[source],
      this.nodes[drain],
      -drainConductance
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[source],
      this.nodes[source],
      drainConductance + this.gm
    );
    CircuitElm.sim.stampMatrix(
      this.nodes[source],
      this.nodes[gate],
      -this.gm
    );
    CircuitElm.sim.stampRightSide(this.nodes[drain], rightSide);
    CircuitElm.sim.stampRightSide(this.nodes[source], -rightSide);
  }

  public override getCurrent(): number {
    return this.ids;
  }

  public override getPower(): number {
    return (
      this.ids * (this.volts[2] - this.volts[1]) -
      this.diodeCurrent1 *
        (this.volts[1] - this.volts[this.bodyTerminal]) -
      this.diodeCurrent2 *
        (this.volts[2] - this.volts[this.bodyTerminal])
    );
  }

  public override getVoltageDiff(): number {
    return this.volts[2] - this.volts[1];
  }

  public override getConnection(first: number, second: number): boolean {
    return first !== 0 && second !== 0;
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override getCurrentIntoNode(node: number): number {
    if (node === 0) {
      return 0;
    }
    if (node === 3) {
      return -this.diodeCurrent1 - this.diodeCurrent2;
    }
    if (node === 1) {
      return this.ids + this.diodeCurrent1;
    }
    return -this.ids + this.diodeCurrent2;
  }

  public override flipX(center2: number, count = 1): void {
    if (this.x === this.x2) {
      this.flags ^= MosfetElm.FLAG_FLIP;
    }
    super.flipX(center2, count);
  }

  public override flipY(center2: number, count = 1): void {
    if (this.y === this.y2) {
      this.flags ^= MosfetElm.FLAG_FLIP;
    }
    super.flipY(center2, count);
  }

  public override flipXY(xMinusY: number, count = 1): void {
    this.flags ^= MosfetElm.FLAG_FLIP;
    super.flipXY(xMinusY, count);
  }
}
