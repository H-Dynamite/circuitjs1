import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Inductor } from "./Inductor";
import { RelayContactElm } from "./RelayContactElm";

/** Standalone relay coil linked to contacts by label. */
export class RelayCoilElm extends CircuitElm {
  public static readonly TYPE_NORMAL = 0;
  public static readonly TYPE_ON_DELAY = 1;
  public static readonly TYPE_OFF_DELAY = 2;
  public static readonly TYPE_LATCHING = 3;

  public inductance = 0.2;
  public label = "label";
  public onCurrent = 0.02;
  public offCurrent = 0.015;
  public coilResistance = 20;
  public switchingTime = 0.005;
  public switchingTimeOn = 0.005;
  public switchingTimeOff = 0.005;
  public coilCurrent = 0;
  public averageCurrent = 0;
  public lastTransition = 0;
  public state = 0;
  public switchPosition = 0;
  public type = RelayCoilElm.TYPE_NORMAL;
  public readonly ind: Inductor;
  public coilPosts: Point[] = [];
  public coilLeads: Point[] = [];
  private parentElements: CircuitElm[] = [];

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
      this.label = CustomLogicModel.unescape(tokenizer.nextToken());
      this.inductance = Number(tokenizer.nextToken());
      this.coilCurrent = Number(tokenizer.nextToken());
      this.onCurrent = Number(tokenizer.nextToken());
      this.coilResistance = Number(tokenizer.nextToken());
      this.offCurrent = Number(tokenizer.nextToken());
      this.switchingTime = Number(tokenizer.nextToken());
      this.type = Number.parseInt(tokenizer.nextToken(), 10) || 0;
      this.state = Number.parseInt(tokenizer.nextToken(), 10) || 0;
      this.switchPosition =
        Number.parseInt(tokenizer.nextToken(), 10) || 0;
    }
    this.ind = new Inductor(CircuitElm.sim);
    this.ind.setup(
      this.inductance,
      this.coilCurrent,
      Inductor.FLAG_BACK_EULER
    );
    this.noDiagonal = true;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 425;
  }

  public override getPostCount(): number {
    return 2;
  }

  public override getInternalNodeCount(): number {
    return 1;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${CustomLogicModel.escape(this.label)} ` +
      `${this.inductance} ${this.coilCurrent} ${this.onCurrent} ` +
      `${this.coilResistance} ${this.offCurrent} ${this.switchingTime} ` +
      `${this.type} ${this.state} ${this.switchPosition}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "lb", this.label);
    XMLSerializer.dumpAttr(element, "in", this.inductance);
    XMLSerializer.dumpAttr(element, "oc", this.onCurrent);
    XMLSerializer.dumpAttr(element, "cr", this.coilResistance);
    XMLSerializer.dumpAttr(element, "ofc", this.offCurrent);
    XMLSerializer.dumpAttr(element, "swt", this.switchingTime);
    XMLSerializer.dumpAttr(element, "tp", this.type);
    XMLSerializer.dumpAttr(element, "ci", this.coilCurrent);
    XMLSerializer.dumpAttr(element, "st", this.state);
    XMLSerializer.dumpAttr(element, "sp", this.switchPosition);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.label = xml.parseStringAttr("lb", this.label) ?? this.label;
    this.inductance = xml.parseDoubleAttr("in", this.inductance);
    this.onCurrent = xml.parseDoubleAttr("oc", this.onCurrent);
    this.coilResistance = xml.parseDoubleAttr("cr", this.coilResistance);
    this.offCurrent = xml.parseDoubleAttr("ofc", this.offCurrent);
    this.switchingTime = xml.parseDoubleAttr("swt", this.switchingTime);
    this.type = xml.parseIntAttr("tp", this.type);
    this.coilCurrent = xml.parseDoubleAttr("ci", this.coilCurrent);
    this.state = xml.parseIntAttr("st", this.state);
    this.switchPosition = xml.parseIntAttr("sp", this.switchPosition);
    this.ind.setup(
      this.inductance,
      this.coilCurrent,
      Inductor.FLAG_BACK_EULER
    );
  }

  public override setPoints(): void {
    super.setPoints();
    const distance = Math.max(this.dn, 1);
    const boxScale = Math.min(0.4, 12 / distance);
    this.coilPosts = [this.point1, this.point2];
    this.coilLeads = this.newPointArray(2);
    this.interpPoint(
      this.point1,
      this.point2,
      this.coilLeads[0],
      0.5 - boxScale
    );
    this.interpPoint(
      this.point1,
      this.point2,
      this.coilLeads[1],
      0.5 + boxScale
    );
  }

  public override getPost(index: number): Point {
    return this.coilPosts[index] ?? this.point1;
  }

  public override setParentList(elements: CircuitElm[]): void {
    this.parentElements = elements;
    this.setSwitchPositions();
  }

  private setSwitchPositions(): void {
    for (const element of this.parentElements) {
      if (
        element instanceof RelayContactElm &&
        element.label === this.label
      ) {
        element.setRelayPosition(1 - this.switchPosition, this.type);
      }
    }
  }

  public override reset(): void {
    super.reset();
    this.ind?.reset();
    this.coilCurrent = 0;
    this.averageCurrent = 0;
    this.state = 0;
  }

  public override stamp(): void {
    this.ind.stamp(this.nodes[0], this.nodes[2]);
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[1],
      this.coilResistance
    );
    if (this.type === RelayCoilElm.TYPE_ON_DELAY) {
      this.switchingTimeOn = this.switchingTime;
      this.switchingTimeOff = 0;
    } else if (this.type === RelayCoilElm.TYPE_OFF_DELAY) {
      this.switchingTimeOn = 0;
      this.switchingTimeOff = this.switchingTime;
    } else {
      this.switchingTimeOn = this.switchingTime;
      this.switchingTimeOff = this.switchingTime;
    }
    this.setSwitchPositions();
  }

  public override startIteration(): void {
    this.ind.startIteration(this.volts[0] - this.volts[2]);
    const smoothing = Math.exp(-CircuitElm.sim.timeStep * 1000);
    this.averageCurrent =
      smoothing * this.averageCurrent +
      (1 - smoothing) * Math.abs(this.coilCurrent);
    const oldPosition = this.switchPosition;
    if (this.state === 0) {
      if (this.averageCurrent > this.onCurrent) {
        this.lastTransition = CircuitElm.sim.t;
        this.state = 1;
      }
    } else if (this.state === 1) {
      if (this.averageCurrent < this.offCurrent) {
        this.state = 0;
      } else if (
        CircuitElm.sim.t - this.lastTransition >
        this.switchingTimeOn
      ) {
        this.state = 2;
        this.switchPosition =
          this.type === RelayCoilElm.TYPE_LATCHING
            ? 1 - this.switchPosition
            : 1;
      }
    } else if (this.state === 2) {
      if (this.averageCurrent < this.offCurrent) {
        this.lastTransition = CircuitElm.sim.t;
        this.state = 3;
      }
    } else if (this.averageCurrent > this.onCurrent) {
      this.state = 2;
    } else if (
      CircuitElm.sim.t - this.lastTransition >
      this.switchingTimeOff
    ) {
      this.state = 0;
      if (this.type !== RelayCoilElm.TYPE_LATCHING) {
        this.switchPosition = 0;
      }
    }
    if (oldPosition !== this.switchPosition) this.setSwitchPositions();
  }

  public override doStep(): void {
    this.ind.doStep(this.volts[0] - this.volts[2]);
  }

  public override calculateCurrent(): void {
    this.coilCurrent = this.ind.calculateCurrent(
      this.volts[0] - this.volts[2]
    );
  }

  public override getCurrentIntoNode(index: number): number {
    return index === 0 ? -this.coilCurrent : this.coilCurrent;
  }

  public override getConnection(_first: number, _second: number): boolean {
    return true;
  }
}
