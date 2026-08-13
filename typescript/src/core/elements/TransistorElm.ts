import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { TransistorModel } from "../TransistorModel";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Nonlinear Gummel-Poon electrical core from TransistorElm.java. */
export class TransistorElm extends CircuitElm {
  public static readonly FLAG_FLIP = 1;
  public static readonly FLAG_CIRCLE = 2;
  public static readonly FLAGS_GLOBAL = TransistorElm.FLAG_CIRCLE;
  public static readonly vt = 0.025865;
  public static lastModelName = "default";
  public static globalFlags = 0;

  public pnp: number;
  public beta = 100;
  public gmin = 0;
  public modelName = TransistorElm.lastModelName;
  public model: TransistorModel | null = null;
  public badIters = 0;
  public localSubIters = 0;
  public ic = 0;
  public ie = 0;
  public ib = 0;
  public capVoltBE = 0;
  public capVoltBC = 0;
  public capCurBE = 0;
  public capCurBC = 0;
  public geqBE = 0;
  public geqBC = 0;
  public ceqBE = 0;
  public ceqBC = 0;
  public vcrit = 0;
  public lastvbc = 0;
  public lastvbe = 0;
  public coll: Point[] = [];
  public emit: Point[] = [];
  public base = new Point();

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
    this.pnp = interactive
      ? x2OrPnp
        ? -1
        : 1
      : Number(tokenizer?.hasMoreTokens() ? tokenizer.nextToken() : 1);

    if (tokenizer !== undefined) {
      if (tokenizer.hasMoreTokens()) {
        this.lastvbe = Number(tokenizer.nextToken());
      }
      if (tokenizer.hasMoreTokens()) {
        this.lastvbc = Number(tokenizer.nextToken());
      }
      this.volts[0] = 0;
      this.volts[1] = -this.lastvbe;
      this.volts[2] = -this.lastvbc;
      if (tokenizer.hasMoreTokens()) {
        this.beta = Number(tokenizer.nextToken());
      }
      if (tokenizer.hasMoreTokens()) {
        this.modelName = CustomLogicModel.unescape(
          tokenizer.nextToken()
        );
      }
      TransistorElm.globalFlags =
        this.flags & TransistorElm.FLAGS_GLOBAL;
    }
    this.setup();
  }

  public setup(): void {
    this.model = TransistorModel.getModelWithNameOrCopy(
      this.modelName,
      this.model
    );
    this.modelName = this.model.name;
    this.vcrit =
      TransistorElm.vt *
      Math.log(
        TransistorElm.vt /
          (Math.sqrt(2) * this.model.satCur)
      );
    this.noDiagonal = true;
  }

  public updateModels(): void {
    this.setup();
  }

  public override getDumpType(): number {
    return "t".charCodeAt(0);
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getPost(index: number): Point {
    if (index === 0) {
      return this.point1;
    }
    return index === 1
      ? (this.coll[0] ?? this.point2)
      : (this.emit[0] ?? this.point2);
  }

  public override setPoints(): void {
    this.flags &= ~TransistorElm.FLAGS_GLOBAL;
    this.flags |= TransistorElm.globalFlags;
    super.setPoints();
    if (this.hasFlag(TransistorElm.FLAG_FLIP)) {
      this.dsign = -this.dsign;
    }
    const halfSize = 16 * this.dsign * this.pnp;
    this.coll = this.newPointArray(2);
    this.emit = this.newPointArray(2);
    this.interpPoint2(
      this.point1,
      this.point2,
      this.coll[0],
      this.emit[0],
      1,
      halfSize
    );
    const leadFraction = this.dn === 0 ? 1 : 1 - 13 / this.dn;
    this.interpPoint2(
      this.point1,
      this.point2,
      this.coll[1],
      this.emit[1],
      leadFraction,
      6 * this.dsign * this.pnp
    );
    this.base = this.interpPoint(
      this.point1,
      this.point2,
      this.dn === 0 ? 1 : 1 - 16 / this.dn
    );
  }

  public override reset(): void {
    this.volts.fill(0);
    this.lastvbc = 0;
    this.lastvbe = 0;
    this.capVoltBE = 0;
    this.capVoltBC = 0;
    this.capCurBE = 0;
    this.capCurBC = 0;
    this.geqBE = 0;
    this.geqBC = 0;
    this.ceqBE = 0;
    this.ceqBC = 0;
    this.badIters = 0;
    this.localSubIters = 0;
  }

  public override dumpXml(document: Document, element: Element): void {
    const model = this.requireModel();
    if (!model.builtIn && !model.dumped) {
      model.dumpXml(document);
    }
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "pn", this.pnp);
    XMLSerializer.dumpAttr(element, "be", this.beta);
    XMLSerializer.dumpAttr(element, "mo", this.modelName);
  }

  public dumpXmlState(_document: Document, element: Element): void {
    XMLSerializer.dumpAttr(
      element,
      "vbe",
      this.volts[0] - this.volts[1]
    );
    XMLSerializer.dumpAttr(
      element,
      "vbc",
      this.volts[0] - this.volts[2]
    );
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.pnp = xml.parseIntAttr("pn", this.pnp);
    this.beta = xml.parseDoubleAttr("be", this.beta);
    this.modelName =
      xml.parseStringAttr("mo", this.modelName) ?? "default";
    this.lastvbe = xml.parseDoubleAttr("vbe", 0);
    this.lastvbc = xml.parseDoubleAttr("vbc", 0);
    this.volts[0] = 0;
    this.volts[1] = -this.lastvbe;
    this.volts[2] = -this.lastvbc;
    TransistorElm.globalFlags =
      this.flags & TransistorElm.FLAGS_GLOBAL;
    this.setup();
  }

  public limitStep(newVoltage: number, oldVoltage: number): number {
    if (
      newVoltage > this.vcrit &&
      Math.abs(newVoltage - oldVoltage) > 2 * TransistorElm.vt
    ) {
      if (oldVoltage > 0) {
        const argument =
          1 + (newVoltage - oldVoltage) / TransistorElm.vt;
        newVoltage =
          argument > 0
            ? oldVoltage + TransistorElm.vt * Math.log(argument)
            : this.vcrit;
      } else {
        newVoltage =
          TransistorElm.vt *
          Math.log(newVoltage / TransistorElm.vt);
      }
      CircuitElm.sim.converged = false;
    }
    return newVoltage;
  }

  public static calcJunctionCap(
    junctionVoltage: number,
    zeroBiasCapacitance: number,
    junctionPotential: number,
    gradingCoefficient: number
  ): number {
    if (zeroBiasCapacitance <= 0) {
      return 0;
    }
    const forwardCoefficient = 0.5;
    if (
      junctionVoltage <
      forwardCoefficient * junctionPotential
    ) {
      return (
        zeroBiasCapacitance /
        (1 - junctionVoltage / junctionPotential) **
          gradingCoefficient
      );
    }
    return (
      (zeroBiasCapacitance /
        (1 - forwardCoefficient) **
          (1 + gradingCoefficient)) *
      (1 -
        forwardCoefficient * (1 + gradingCoefficient) +
        (gradingCoefficient * junctionVoltage) /
          junctionPotential)
    );
  }

  public override startIteration(): void {
    const model = this.requireModel();
    const hasBaseEmitterCapacitance =
      model.junctionCapBE > 0 || model.transitTimeF > 0;
    const hasBaseCollectorCapacitance =
      model.junctionCapBC > 0 || model.transitTimeR > 0;

    if (
      hasBaseEmitterCapacitance &&
      CircuitElm.sim.timeStep > 0
    ) {
      const junctionVoltage = this.pnp * this.capVoltBE;
      let capacitance = TransistorElm.calcJunctionCap(
        junctionVoltage,
        model.junctionCapBE,
        model.junctionPotBE,
        model.junctionExpBE
      );
      if (model.transitTimeF > 0 && junctionVoltage > 0) {
        const thermalVoltage =
          TransistorElm.vt * model.emissionCoeffF;
        capacitance +=
          (model.transitTimeF *
            model.satCur *
            Math.exp(junctionVoltage / thermalVoltage)) /
          thermalVoltage;
      }
      this.geqBE =
        (2 * capacitance) / CircuitElm.sim.timeStep;
      if (this.geqBE < 1e-20) {
        this.geqBE = 0;
        this.ceqBE = 0;
        this.capCurBE = 0;
      } else {
        this.ceqBE =
          -this.geqBE * this.capVoltBE - this.capCurBE;
      }
    }

    if (
      hasBaseCollectorCapacitance &&
      CircuitElm.sim.timeStep > 0
    ) {
      const junctionVoltage = this.pnp * this.capVoltBC;
      let capacitance = TransistorElm.calcJunctionCap(
        junctionVoltage,
        model.junctionCapBC,
        model.junctionPotBC,
        model.junctionExpBC
      );
      if (model.transitTimeR > 0 && junctionVoltage > 0) {
        const thermalVoltage =
          TransistorElm.vt * model.emissionCoeffR;
        capacitance +=
          (model.transitTimeR *
            model.satCur *
            Math.exp(junctionVoltage / thermalVoltage)) /
          thermalVoltage;
      }
      this.geqBC =
        (2 * capacitance) / CircuitElm.sim.timeStep;
      if (this.geqBC < 1e-20) {
        this.geqBC = 0;
        this.ceqBC = 0;
        this.capCurBC = 0;
      } else {
        this.ceqBC =
          -this.geqBC * this.capVoltBC - this.capCurBC;
      }
    }
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
  }

  public override doStep(): void {
    const model = this.requireModel();
    let vbc = this.pnp * (this.volts[0] - this.volts[1]);
    let vbe = this.pnp * (this.volts[0] - this.volts[2]);
    const notConverged =
      Math.abs(vbc - this.lastvbc) > 0.01 ||
      Math.abs(vbe - this.lastvbe) > 0.01;
    if (notConverged) {
      CircuitElm.sim.converged = false;
      this.localSubIters += 1;
    } else {
      this.localSubIters = 0;
    }

    this.gmin = 1e-12;
    if (this.localSubIters > 100 && this.badIters < 5) {
      this.gmin = Math.exp(
        -9 *
          Math.log(10) *
          (1 - this.localSubIters / 300)
      );
      this.gmin = Math.min(this.gmin, 0.1);
    }
    vbc = this.limitStep(vbc, this.lastvbc);
    vbe = this.limitStep(vbe, this.lastvbe);
    this.lastvbc = vbc;
    this.lastvbe = vbe;

    const saturationCurrent = model.satCur;
    const forwardRollOff = model.invRollOffF;
    const baseEmitterLeakage = model.BEleakCur;
    const baseEmitterLeakageVoltage =
      model.leakBEemissionCoeff * TransistorElm.vt;
    const reverseRollOff = model.invRollOffR;
    const baseCollectorLeakage = model.BCleakCur;
    const baseCollectorLeakageVoltage =
      model.leakBCemissionCoeff * TransistorElm.vt;

    let thermalVoltage =
      TransistorElm.vt * model.emissionCoeffF;
    let baseEmitterCurrent: number;
    let baseEmitterConductance: number;
    let baseEmitterLeakCurrent: number;
    let baseEmitterLeakConductance: number;
    if (vbe > -5 * thermalVoltage) {
      const exponential = Math.exp(vbe / thermalVoltage);
      baseEmitterCurrent =
        saturationCurrent * (exponential - 1) + this.gmin * vbe;
      baseEmitterConductance =
        (saturationCurrent * exponential) / thermalVoltage +
        this.gmin;
      if (baseEmitterLeakage === 0) {
        baseEmitterLeakCurrent = 0;
        baseEmitterLeakConductance = 0;
      } else {
        const leakageExponential = Math.exp(
          vbe / baseEmitterLeakageVoltage
        );
        baseEmitterLeakCurrent =
          baseEmitterLeakage * (leakageExponential - 1);
        baseEmitterLeakConductance =
          (baseEmitterLeakage * leakageExponential) /
          baseEmitterLeakageVoltage;
      }
    } else {
      baseEmitterConductance =
        -saturationCurrent / vbe + this.gmin;
      baseEmitterCurrent = baseEmitterConductance * vbe;
      baseEmitterLeakConductance = -baseEmitterLeakage / vbe;
      baseEmitterLeakCurrent =
        baseEmitterLeakConductance * vbe;
    }

    thermalVoltage =
      TransistorElm.vt * model.emissionCoeffR;
    let baseCollectorCurrent: number;
    let baseCollectorConductance: number;
    let baseCollectorLeakCurrent: number;
    let baseCollectorLeakConductance: number;
    if (vbc > -5 * thermalVoltage) {
      const exponential = Math.exp(vbc / thermalVoltage);
      baseCollectorCurrent =
        saturationCurrent * (exponential - 1) + this.gmin * vbc;
      baseCollectorConductance =
        (saturationCurrent * exponential) / thermalVoltage +
        this.gmin;
      if (baseCollectorLeakage === 0) {
        baseCollectorLeakCurrent = 0;
        baseCollectorLeakConductance = 0;
      } else {
        const leakageExponential = Math.exp(
          vbc / baseCollectorLeakageVoltage
        );
        baseCollectorLeakCurrent =
          baseCollectorLeakage * (leakageExponential - 1);
        baseCollectorLeakConductance =
          (baseCollectorLeakage * leakageExponential) /
          baseCollectorLeakageVoltage;
      }
    } else {
      baseCollectorConductance =
        -saturationCurrent / vbc + this.gmin;
      baseCollectorCurrent = baseCollectorConductance * vbc;
      baseCollectorLeakConductance =
        -baseCollectorLeakage / vbc;
      baseCollectorLeakCurrent =
        baseCollectorLeakConductance * vbc;
    }

    const q1 =
      1 /
      (1 -
        model.invEarlyVoltF * vbc -
        model.invEarlyVoltR * vbe);
    let baseCharge: number;
    let baseChargeDerivativeEmitter: number;
    let baseChargeDerivativeCollector: number;
    if (forwardRollOff === 0 && reverseRollOff === 0) {
      baseCharge = q1;
      baseChargeDerivativeEmitter =
        q1 * baseCharge * model.invEarlyVoltR;
      baseChargeDerivativeCollector =
        q1 * baseCharge * model.invEarlyVoltF;
    } else {
      const q2 =
        forwardRollOff * baseEmitterCurrent +
        reverseRollOff * baseCollectorCurrent;
      const argument = Math.max(0, 1 + 4 * q2);
      const squareRoot = argument === 0 ? 1 : Math.sqrt(argument);
      baseCharge = (q1 * (1 + squareRoot)) / 2;
      baseChargeDerivativeEmitter =
        q1 *
        (baseCharge * model.invEarlyVoltR +
          (forwardRollOff * baseEmitterConductance) / squareRoot);
      baseChargeDerivativeCollector =
        q1 *
        (baseCharge * model.invEarlyVoltF +
          (reverseRollOff * baseCollectorConductance) / squareRoot);
    }

    const collectorCurrent =
      (baseEmitterCurrent - baseCollectorCurrent) / baseCharge -
      baseCollectorCurrent / model.betaR -
      baseCollectorLeakCurrent;
    const baseCurrent =
      baseEmitterCurrent / this.beta +
      baseEmitterLeakCurrent +
      baseCollectorCurrent / model.betaR +
      baseCollectorLeakCurrent;
    this.ic = this.pnp * collectorCurrent;
    this.ib = this.pnp * baseCurrent;
    this.ie = this.pnp * (-collectorCurrent - baseCurrent);

    const inputConductance =
      baseEmitterConductance / this.beta +
      baseEmitterLeakConductance;
    const feedbackConductance =
      baseCollectorConductance / model.betaR +
      baseCollectorLeakConductance;
    const outputConductance =
      (baseCollectorConductance +
        (baseEmitterCurrent - baseCollectorCurrent) *
          baseChargeDerivativeCollector /
          baseCharge) /
      baseCharge;
    const transconductance =
      (baseEmitterConductance -
        (baseEmitterCurrent - baseCollectorCurrent) *
          baseChargeDerivativeEmitter /
          baseCharge) /
        baseCharge -
      outputConductance;

    const equivalentBaseEmitter =
      this.pnp *
      (collectorCurrent +
        baseCurrent -
        vbe *
          (transconductance +
            outputConductance +
            inputConductance) +
        vbc * outputConductance);
    const equivalentBaseCollector =
      this.pnp *
      (-collectorCurrent +
        vbe * (transconductance + outputConductance) -
        vbc * (feedbackConductance + outputConductance));

    if (!Number.isFinite(this.ib) || !Number.isFinite(this.ic)) {
      throw new Error("infinite transistor current");
    }

    const sim = CircuitElm.sim;
    sim.stampMatrix(
      this.nodes[1],
      this.nodes[1],
      feedbackConductance + outputConductance
    );
    sim.stampMatrix(
      this.nodes[1],
      this.nodes[0],
      -feedbackConductance + transconductance
    );
    sim.stampMatrix(
      this.nodes[1],
      this.nodes[2],
      -transconductance - outputConductance
    );
    sim.stampMatrix(
      this.nodes[0],
      this.nodes[0],
      inputConductance + feedbackConductance
    );
    sim.stampMatrix(
      this.nodes[0],
      this.nodes[2],
      -inputConductance
    );
    sim.stampMatrix(
      this.nodes[0],
      this.nodes[1],
      -feedbackConductance
    );
    sim.stampMatrix(
      this.nodes[2],
      this.nodes[0],
      -inputConductance - transconductance
    );
    sim.stampMatrix(
      this.nodes[2],
      this.nodes[1],
      -outputConductance
    );
    sim.stampMatrix(
      this.nodes[2],
      this.nodes[2],
      inputConductance +
        transconductance +
        outputConductance
    );
    sim.stampRightSide(
      this.nodes[0],
      -equivalentBaseEmitter - equivalentBaseCollector
    );
    sim.stampRightSide(this.nodes[1], equivalentBaseCollector);
    sim.stampRightSide(this.nodes[2], equivalentBaseEmitter);

    this.stampJunctionCompanion(
      0,
      2,
      this.geqBE,
      this.ceqBE
    );
    this.stampJunctionCompanion(
      0,
      1,
      this.geqBC,
      this.ceqBC
    );
  }

  public override stepFinished(): void {
    if (Math.abs(this.ic) > 1e12 || Math.abs(this.ib) > 1e12) {
      throw new Error("max transistor current exceeded");
    }
    this.badIters = this.localSubIters > 100 ? this.badIters + 1 : 0;
    if (this.geqBE > 0) {
      this.capVoltBE = this.volts[0] - this.volts[2];
      this.capCurBE =
        this.geqBE * this.capVoltBE + this.ceqBE;
      this.ib += this.capCurBE;
      this.ie -= this.capCurBE;
    }
    if (this.geqBC > 0) {
      this.capVoltBC = this.volts[0] - this.volts[1];
      this.capCurBC =
        this.geqBC * this.capVoltBC + this.ceqBC;
      this.ib += this.capCurBC;
      this.ic -= this.capCurBC;
    }
    this.localSubIters = 0;
  }

  public override getPower(): number {
    return (
      (this.volts[0] - this.volts[2]) * this.ib +
      (this.volts[1] - this.volts[2]) * this.ic
    );
  }

  public override getCurrentIntoNode(node: number): number {
    if (node === 0) {
      return -this.ib;
    }
    if (node === 1) {
      return -this.ic;
    }
    return -this.ie;
  }

  public setBeta(beta: number): void {
    this.beta = beta;
    this.setup();
  }

  public override flipX(center2: number, count = 1): void {
    if (this.x === this.x2) {
      this.flags ^= TransistorElm.FLAG_FLIP;
    }
    super.flipX(center2, count);
  }

  public override flipY(center2: number, count = 1): void {
    if (this.y === this.y2) {
      this.flags ^= TransistorElm.FLAG_FLIP;
    }
    super.flipY(center2, count);
  }

  public override flipXY(xMinusY: number, count = 1): void {
    this.flags ^= TransistorElm.FLAG_FLIP;
    super.flipXY(xMinusY, count);
  }

  private stampJunctionCompanion(
    first: number,
    second: number,
    conductance: number,
    current: number
  ): void {
    if (conductance <= 0) {
      return;
    }
    const sim = CircuitElm.sim;
    sim.stampConductance(
      this.nodes[first],
      this.nodes[second],
      conductance
    );
    sim.stampRightSide(this.nodes[first], -current);
    sim.stampRightSide(this.nodes[second], current);
  }

  private requireModel(): TransistorModel {
    if (this.model === null) {
      throw new Error("Transistor model is unavailable");
    }
    return this.model;
  }
}
