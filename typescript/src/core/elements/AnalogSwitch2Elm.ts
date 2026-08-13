import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { AnalogSwitchElm } from "./AnalogSwitchElm";

/** Voltage-controlled SPDT switch. */
export class AnalogSwitch2Elm extends AnalogSwitchElm {
  public swposts: Point[] = [];
  public swpoles: Point[] = [];
  public ctlPoint = new Point();

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
    flags = AnalogSwitchElm.FLAG_PULLDOWN,
    tokenizer?: StringTokenizer
  ) {
    super(
      x,
      y,
      x2,
      y2,
      flags,
      tokenizer ?? new StringTokenizer("")
    );
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 160;
  }

  public override getXmlDumpType(): string {
    return "as2";
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.swposts = this.newPointArray(2);
    this.swpoles = this.newPointArray(2);
    this.interpPoint2(
      this.lead1,
      this.lead2,
      this.swpoles[0],
      this.swpoles[1],
      1,
      this.openhs
    );
    this.interpPoint2(
      this.point1,
      this.point2,
      this.swposts[0],
      this.swposts[1],
      1,
      this.openhs
    );
    this.ctlPoint = this.interpPoint(
      this.lead1,
      this.lead2,
      0.5,
      this.openhs
    );
  }

  public override getPostCount(): number {
    return 4;
  }

  public override getPost(index: number): Point {
    return index === 0
      ? this.point1
      : index === 3
        ? this.ctlPoint
        : (this.swposts[index - 1] ?? this.point2);
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[0]);
    CircuitElm.sim.stampNonLinear(this.nodes[1]);
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
    if (this.needsPulldown()) {
      CircuitElm.sim.stampResistor(
        this.nodes[1],
        CircuitNode.ground,
        this.rOff
      );
      CircuitElm.sim.stampResistor(
        this.nodes[2],
        CircuitNode.ground,
        this.rOff
      );
    }
  }

  public override doStep(): void {
    this.open = this.volts[3] < this.threshold;
    if (this.hasFlag(AnalogSwitchElm.FLAG_INVERT)) {
      this.open = !this.open;
    }
    const selected = this.open ? 2 : 1;
    const unselected = this.open ? 1 : 2;
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[selected],
      this.rOn
    );
    if (!this.needsPulldown()) {
      CircuitElm.sim.stampResistor(
        this.nodes[0],
        this.nodes[unselected],
        this.rOff
      );
    }
  }

  public override calculateCurrent(): void {
    const selected = this.open ? 2 : 1;
    this.current =
      (this.volts[0] - this.volts[selected]) / this.rOn;
  }

  public override getConnection(first: number, second: number): boolean {
    if (first === 3 || second === 3) {
      return false;
    }
    return this.needsPulldown()
      ? this.comparePair(first, second, 0, this.open ? 2 : 1)
      : true;
  }

  public override hasGroundConnection(node: number): boolean {
    return this.needsPulldown() && node !== 3;
  }

  public override getCurrentIntoNode(node: number): number {
    if (node === 0) return -this.current;
    return node === (this.open ? 2 : 1) ? this.current : 0;
  }
}
