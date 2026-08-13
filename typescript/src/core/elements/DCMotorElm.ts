import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Inductor } from "./Inductor";

/** Coupled electrical/mechanical DC motor model. */
export class DCMotorElm extends CircuitElm {
  public armature: Inductor;
  public inertia: Inductor;
  public inductance = 0.5;
  public resistance = 1;
  public torqueConstant = 0.15;
  public backEmfConstant = 0.15;
  public momentOfInertia = 0.02;
  public friction = 0.05;
  public gearRatio = 1;
  public staticFriction = 0;
  public angle = Math.PI / 2;
  public speed = 0;
  public coilCurrent = 0;
  public inertiaCurrent = 0;
  public voltageSources: Array<VoltageSource | null> = [null, null];

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
    const keys = [
      "inductance",
      "resistance",
      "torqueConstant",
      "backEmfConstant",
      "momentOfInertia",
      "friction",
      "gearRatio",
      "staticFriction"
    ] as const;
    for (const key of keys) {
      if (!tokenizer.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this[key] = value;
    }
    this.armature = new Inductor(CircuitElm.sim);
    this.inertia = new Inductor(CircuitElm.sim);
    this.setupModels();
    this.allocNodes();
  }

  public setupModels(): void {
    this.armature.setup(
      this.inductance,
      this.coilCurrent,
      Inductor.FLAG_BACK_EULER
    );
    this.inertia.setup(
      this.momentOfInertia,
      this.inertiaCurrent,
      Inductor.FLAG_BACK_EULER
    );
  }

  public override getDumpType(): number {
    return 415;
  }

  public override getInternalNodeCount(): number {
    return 4;
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(36);
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    if (index === 0) {
      source.setNodes(this.nodes[3], this.nodes[1]);
    } else {
      source.setNodes(this.nodes[4], CircuitNode.ground);
    }
  }

  public override reset(): void {
    super.reset();
    this.armature.reset();
    this.inertia.reset();
    this.coilCurrent = 0;
    this.inertiaCurrent = 0;
    this.speed = 0;
  }

  public override stamp(): void {
    const backEmf = this.voltageSources[0];
    const torque = this.voltageSources[1];
    if (backEmf === null || torque === null) {
      throw new Error("DC motor voltage source is unassigned");
    }
    this.armature.stamp(this.nodes[0], this.nodes[2]);
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[3],
      this.resistance
    );
    CircuitElm.sim.stampVoltageSource(
      this.nodes[3],
      this.nodes[1],
      backEmf
    );
    this.inertia.stamp(this.nodes[4], this.nodes[5]);
    CircuitElm.sim.stampResistor(
      this.nodes[5],
      CircuitNode.ground,
      this.friction
    );
    CircuitElm.sim.stampVoltageSource(
      this.nodes[4],
      CircuitNode.ground,
      torque
    );
  }

  public override startIteration(): void {
    this.armature.startIteration(this.volts[0] - this.volts[2]);
    this.inertia.startIteration(this.volts[4] - this.volts[5]);
    this.angle += this.speed * CircuitElm.sim.timeStep;
  }

  public override doStep(): void {
    const backEmf = this.voltageSources[0];
    const torque = this.voltageSources[1];
    if (backEmf === null || torque === null) {
      throw new Error("DC motor voltage source is unassigned");
    }
    CircuitElm.sim.updateVoltageSource(
      this.nodes[4],
      CircuitNode.ground,
      torque,
      this.coilCurrent * this.torqueConstant
    );
    CircuitElm.sim.updateVoltageSource(
      this.nodes[3],
      this.nodes[1],
      backEmf,
      this.inertiaCurrent * this.backEmfConstant
    );
    this.armature.doStep(this.volts[0] - this.volts[2]);
    this.inertia.doStep(this.volts[4] - this.volts[5]);
  }

  public override calculateCurrent(): void {
    this.coilCurrent = this.armature.calculateCurrent(
      this.volts[0] - this.volts[2]
    );
    this.inertiaCurrent = this.inertia.calculateCurrent(
      this.volts[4] - this.volts[5]
    );
    this.speed = this.inertiaCurrent;
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    if (source === this.voltageSources[0]) this.current = current;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.inductance} ${this.resistance} ` +
      `${this.torqueConstant} ${this.backEmfConstant} ` +
      `${this.momentOfInertia} ${this.friction} ${this.gearRatio} ` +
      `${this.staticFriction}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "in", this.inductance);
    XMLSerializer.dumpAttr(element, "rs", this.resistance);
    XMLSerializer.dumpAttr(element, "k", this.torqueConstant);
    XMLSerializer.dumpAttr(element, "kb", this.backEmfConstant);
    XMLSerializer.dumpAttr(element, "j", this.momentOfInertia);
    XMLSerializer.dumpAttr(element, "b", this.friction);
    XMLSerializer.dumpAttr(element, "gr", this.gearRatio);
    XMLSerializer.dumpAttr(element, "ta", this.staticFriction);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.inductance = xml.parseDoubleAttr("in", this.inductance);
    this.resistance = xml.parseDoubleAttr("rs", this.resistance);
    this.torqueConstant = xml.parseDoubleAttr(
      "k",
      this.torqueConstant
    );
    this.backEmfConstant = xml.parseDoubleAttr(
      "kb",
      this.backEmfConstant
    );
    this.momentOfInertia = xml.parseDoubleAttr(
      "j",
      this.momentOfInertia
    );
    this.friction = xml.parseDoubleAttr("b", this.friction);
    this.gearRatio = xml.parseDoubleAttr("gr", this.gearRatio);
    this.staticFriction = xml.parseDoubleAttr(
      "ta",
      this.staticFriction
    );
    this.setupModels();
  }
}
