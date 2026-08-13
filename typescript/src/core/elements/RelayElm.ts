import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Inductor } from "./Inductor";

/**
 * Electromechanical multi-pole relay using the original inductor companion
 * model and current-controlled contact position.
 */
export class RelayElm extends CircuitElm {
  public static readonly FLAG_SWAP_COIL = 1;
  public static readonly FLAG_SHOW_BOX = 2;
  public static readonly FLAG_BOTH_SIDES_COIL = 4;
  public static readonly FLAG_FLIP = 8;
  public static readonly FLAG_PULLDOWN = 16;

  public poleCountValue = 1;
  public inductance = 0.2;
  public rOn = 0.05;
  public rOff = 1e6;
  public onCurrent = 0.02;
  public offCurrent = 0.02;
  public coilResistance = 20;
  public switchingTime = 0.005;
  public coilCurrent = 0;
  public switchCurrent: number[] = [0];
  public dPosition = 0;
  public iPosition = 0;
  public onState = false;
  public nCoil1 = 3;
  public nCoil2 = 4;
  public nCoil3 = 5;
  public readonly ind: Inductor;
  public swposts: Point[][] = [];
  public swpoles: Point[][] = [];
  public coilPosts: Point[] = [];
  public coilLeads: Point[] = [];
  public ptSwitch: Point[] = [];

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
    flags = RelayElm.FLAG_SHOW_BOX |
      RelayElm.FLAG_BOTH_SIDES_COIL |
      RelayElm.FLAG_PULLDOWN,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      this.poleCountValue = Number.parseInt(tokenizer.nextToken(), 10);
      this.inductance = Number(tokenizer.nextToken());
      this.coilCurrent = Number(tokenizer.nextToken());
      this.rOn = Number(tokenizer.nextToken());
      this.rOff = Number(tokenizer.nextToken());
      this.onCurrent = Number(tokenizer.nextToken());
      this.coilResistance = Number(tokenizer.nextToken());
      if (tokenizer.hasMoreTokens()) {
        this.offCurrent = Number(tokenizer.nextToken());
      } else {
        this.offCurrent = this.onCurrent;
      }
      if (tokenizer.hasMoreTokens()) {
        this.switchingTime = Number(tokenizer.nextToken());
      }
      if (tokenizer.hasMoreTokens()) {
        this.iPosition = Number.parseInt(tokenizer.nextToken(), 10);
        this.dPosition = this.iPosition === 2 ? 0.5 : this.iPosition;
        this.onState = this.iPosition === 1;
      }
    }
    this.ind = new Inductor(CircuitElm.sim);
    this.ind.setup(
      this.inductance,
      this.coilCurrent,
      Inductor.FLAG_BACK_EULER
    );
    this.noDiagonal = true;
    this.setupPoles();
    this.allocNodes();
  }

  private setupPoles(): void {
    this.poleCountValue = Math.max(1, this.poleCountValue || 1);
    this.nCoil1 = 3 * this.poleCountValue;
    this.nCoil2 = this.nCoil1 + 1;
    this.nCoil3 = this.nCoil1 + 2;
    if (this.switchCurrent.length !== this.poleCountValue) {
      this.switchCurrent = Array(this.poleCountValue).fill(0);
    }
  }

  public needsPulldown(): boolean {
    return this.hasFlag(RelayElm.FLAG_PULLDOWN);
  }

  public coilStyle(): number {
    if (this.hasFlag(RelayElm.FLAG_SWAP_COIL)) return 2;
    if (this.hasFlag(RelayElm.FLAG_BOTH_SIDES_COIL)) return 0;
    return 1;
  }

  public override getDumpType(): number {
    return 178;
  }

  public override getXmlDumpType(): string {
    return "rl";
  }

  public override getPostCount(): number {
    return 2 + 3 * (this.poleCountValue || 1);
  }

  public override getInternalNodeCount(): number {
    return 1;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.poleCountValue} ${this.inductance} ` +
      `${this.coilCurrent} ${this.rOn} ${this.rOff} ${this.onCurrent} ` +
      `${this.coilResistance} ${this.offCurrent} ${this.switchingTime} ` +
      `${this.iPosition}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "po", this.poleCountValue);
    XMLSerializer.dumpAttr(element, "in", this.inductance);
    XMLSerializer.dumpAttr(element, "ron", this.rOn);
    XMLSerializer.dumpAttr(element, "roff", this.rOff);
    XMLSerializer.dumpAttr(element, "on", this.onCurrent);
    XMLSerializer.dumpAttr(element, "of", this.offCurrent);
    XMLSerializer.dumpAttr(element, "coR", this.coilResistance);
    XMLSerializer.dumpAttr(element, "sw", this.switchingTime);
    XMLSerializer.dumpAttr(element, "i", this.coilCurrent);
    XMLSerializer.dumpAttr(element, "ip", this.iPosition);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.poleCountValue = xml.parseIntAttr("po", this.poleCountValue);
    this.inductance = xml.parseDoubleAttr("in", this.inductance);
    this.rOn = xml.parseDoubleAttr("ron", this.rOn);
    this.rOff = xml.parseDoubleAttr("roff", this.rOff);
    this.onCurrent = xml.parseDoubleAttr("on", this.onCurrent);
    this.offCurrent = xml.parseDoubleAttr("of", this.offCurrent);
    this.coilResistance = xml.parseDoubleAttr("coR", this.coilResistance);
    this.switchingTime = xml.parseDoubleAttr("sw", this.switchingTime);
    this.coilCurrent = xml.parseDoubleAttr("i", this.coilCurrent);
    this.iPosition = xml.parseIntAttr("ip", this.iPosition);
    this.dPosition = this.iPosition === 2 ? 0.5 : this.iPosition;
    this.onState = this.iPosition === 1;
    this.setupPoles();
    this.allocNodes();
    this.ind.setup(
      this.inductance,
      this.coilCurrent,
      Inductor.FLAG_BACK_EULER
    );
  }

  public override setPoints(): void {
    super.setPoints();
    this.setupPoles();
    this.allocNodes();
    const flip = this.hasFlag(RelayElm.FLAG_FLIP)
      ? -this.dsign
      : this.dsign;
    const openHalfSpacing = -flip * 16;
    this.calcLeads(32);
    this.swposts = [];
    this.swpoles = [];
    for (let pole = 0; pole < this.poleCountValue; pole += 1) {
      const posts = this.newPointArray(3);
      const poles = this.newPointArray(3);
      this.interpPoint(
        this.lead1,
        this.lead2,
        poles[0],
        0,
        -openHalfSpacing * 3 * pole
      );
      this.interpPoint(
        this.lead1,
        this.lead2,
        poles[1],
        1,
        -openHalfSpacing * 3 * pole - openHalfSpacing
      );
      this.interpPoint(
        this.lead1,
        this.lead2,
        poles[2],
        1,
        -openHalfSpacing * 3 * pole + openHalfSpacing
      );
      this.interpPoint(
        this.point1,
        this.point2,
        posts[0],
        0,
        -openHalfSpacing * 3 * pole
      );
      this.interpPoint(
        this.point1,
        this.point2,
        posts[1],
        1,
        -openHalfSpacing * 3 * pole - openHalfSpacing
      );
      this.interpPoint(
        this.point1,
        this.point2,
        posts[2],
        1,
        -openHalfSpacing * 3 * pole + openHalfSpacing
      );
      this.swposts.push(posts);
      this.swpoles.push(poles);
    }
    this.coilPosts = this.newPointArray(2);
    this.coilLeads = this.newPointArray(2);
    this.ptSwitch = this.newPointArray(this.poleCountValue);
    const style = this.coilStyle();
    const side = style === 2 ? 1 : 0;
    if (style !== 0) {
      this.interpPoint(
        this.point1,
        this.point2,
        this.coilPosts[0],
        side,
        openHalfSpacing * 2
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.coilPosts[1],
        side,
        openHalfSpacing * 3
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.coilLeads[0],
        0.5,
        openHalfSpacing * 2
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.coilLeads[1],
        0.5,
        openHalfSpacing * 3
      );
    } else {
      const length = Math.max(this.dn, 1);
      this.interpPoint(
        this.point1,
        this.point2,
        this.coilPosts[0],
        0,
        openHalfSpacing * 2
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.coilPosts[1],
        1,
        openHalfSpacing * 2
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.coilLeads[0],
        0.5 - 16 / length,
        openHalfSpacing * 2
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.coilLeads[1],
        0.5 + 16 / length,
        openHalfSpacing * 2
      );
    }
  }

  public override getPost(index: number): Point {
    if (index < 3 * this.poleCountValue) {
      return this.swposts[Math.floor(index / 3)]?.[index % 3] ?? this.point1;
    }
    return this.coilPosts[index - 3 * this.poleCountValue] ?? this.point1;
  }

  public override reset(): void {
    super.reset();
    this.ind?.reset();
    this.coilCurrent = 0;
    this.switchCurrent?.fill(0);
    this.dPosition = 0;
    this.iPosition = 0;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    this.ind.stamp(this.nodes[this.nCoil1], this.nodes[this.nCoil3]);
    CircuitElm.sim.stampResistor(
      this.nodes[this.nCoil3],
      this.nodes[this.nCoil2],
      this.coilResistance
    );
    for (let index = 0; index < 3 * this.poleCountValue; index += 1) {
      CircuitElm.sim.stampNonLinear(this.nodes[index]);
    }
    if (this.needsPulldown()) {
      for (let pole = 0; pole < this.poleCountValue; pole += 1) {
        CircuitElm.sim.stampResistor(
          this.nodes[1 + pole * 3],
          CircuitNode.ground,
          this.rOff
        );
        CircuitElm.sim.stampResistor(
          this.nodes[2 + pole * 3],
          CircuitNode.ground,
          this.rOff
        );
      }
    }
  }

  public override startIteration(): void {
    this.ind.startIteration(
      this.volts[this.nCoil1] - this.volts[this.nCoil3]
    );
    if (this.switchingTime === 0) {
      const scaled =
        (this.coilCurrent * Math.sqrt(2.3)) / this.onCurrent;
      this.dPosition = Math.min(1, Math.max(0, scaled * scaled - 1.3));
      this.iPosition =
        this.dPosition < 0.1 ? 0 : this.dPosition > 0.9 ? 1 : 2;
      return;
    }
    const absoluteCurrent = Math.abs(this.coilCurrent);
    if (this.onState) {
      if (absoluteCurrent < this.offCurrent) {
        this.onState = false;
        this.iPosition = 2;
      } else {
        this.dPosition += CircuitElm.sim.timeStep / this.switchingTime;
        if (this.dPosition >= 1) {
          this.dPosition = 1;
          this.iPosition = 1;
        }
      }
    } else if (absoluteCurrent > this.onCurrent) {
      this.onState = true;
      this.iPosition = 2;
    } else {
      this.dPosition -= CircuitElm.sim.timeStep / this.switchingTime;
      if (this.dPosition <= 0) {
        this.dPosition = 0;
        this.iPosition = 0;
      }
    }
  }

  public override doStep(): void {
    this.ind.doStep(this.volts[this.nCoil1] - this.volts[this.nCoil3]);
    for (let offset = 0; offset < 3 * this.poleCountValue; offset += 3) {
      if (this.iPosition === 0) {
        CircuitElm.sim.stampResistor(
          this.nodes[offset],
          this.nodes[offset + 1],
          this.rOn
        );
        if (!this.needsPulldown()) {
          CircuitElm.sim.stampResistor(
            this.nodes[offset],
            this.nodes[offset + 2],
            this.rOff
          );
        }
      } else if (this.iPosition === 1) {
        CircuitElm.sim.stampResistor(
          this.nodes[offset],
          this.nodes[offset + 2],
          this.rOn
        );
        if (!this.needsPulldown()) {
          CircuitElm.sim.stampResistor(
            this.nodes[offset],
            this.nodes[offset + 1],
            this.rOff
          );
        }
      } else {
        CircuitElm.sim.stampResistor(
          this.nodes[offset],
          this.nodes[offset + 1],
          this.rOff
        );
        CircuitElm.sim.stampResistor(
          this.nodes[offset],
          this.nodes[offset + 2],
          this.rOff
        );
      }
    }
  }

  public override calculateCurrent(): void {
    this.coilCurrent = this.ind.calculateCurrent(
      this.volts[this.nCoil1] - this.volts[this.nCoil3]
    );
    for (let pole = 0; pole < this.poleCountValue; pole += 1) {
      const offset = pole * 3;
      this.switchCurrent[pole] =
        this.iPosition === 2
          ? 0
          : (this.volts[offset] -
              this.volts[offset + 1 + this.iPosition]) /
            this.rOn;
    }
  }

  public override getCurrentIntoNode(index: number): number {
    if (index < 3 * this.poleCountValue) {
      const pole = Math.floor(index / 3);
      const contact = index % 3;
      if (contact === 0) return -this.switchCurrent[pole];
      if (contact === 1 + this.iPosition) return this.switchCurrent[pole];
      return 0;
    }
    return index === 3 * this.poleCountValue
      ? -this.coilCurrent
      : this.coilCurrent;
  }

  public override getConnection(first: number, second: number): boolean {
    return Math.floor(first / 3) === Math.floor(second / 3);
  }

  public override hasGroundConnection(index: number): boolean {
    return this.needsPulldown() && index < this.nCoil1;
  }
}
