import { CircuitElm } from "../CircuitElm";
import { ExprState } from "../Expr";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { ChipElm, ChipPin } from "./ChipElm";
import { VCCSElm } from "./VCCSElm";

/** Expression-controlled voltage-controlled voltage source. */
export class VCVSElm extends VCCSElm {
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
    super(x, y, x2, y2, flags, tokenizer ?? new StringTokenizer(""));
  }

  public override setupPins(): void {
    const count = Number.isInteger(this.inputCount) ? this.inputCount : 2;
    this.sizeX = 2;
    this.sizeY = Math.max(count, 2);
    this.pins = Array<ChipPin>(count + 2);
    for (let index = 0; index < count; index += 1) {
      this.pins[index] = new ChipPin(
        index,
        ChipElm.SIDE_W,
        String.fromCharCode(65 + index)
      );
    }
    this.pins[count] = new ChipPin(0, ChipElm.SIDE_E, "V+");
    this.pins[count].output = true;
    this.pins[count + 1] = new ChipPin(1, ChipElm.SIDE_E, "V-");
    this.lastVolts = Array(count).fill(0);
    this.exprState = new ExprState(count);
    this.allocNodes();
  }

  public override getChipName(): string {
    return "VCVS";
  }

  public override getDumpType(): number {
    return 212;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override stamp(): void {
    const source = this.pins[this.inputCount].voltSource;
    if (source === null) throw new Error("VCVS output source is unassigned");
    CircuitElm.sim.stampNonLinear(source);
    CircuitElm.sim.stampVoltageSource(
      this.nodes[this.inputCount + 1],
      this.nodes[this.inputCount],
      source
    );
  }

  public override doStep(): void {
    const convergence = this.getConvergeLimit();
    for (let index = 0; index < this.inputCount; index += 1) {
      if (
        Math.abs(this.volts[index] - this.lastVolts[index]) >
        convergence
      ) {
        CircuitElm.sim.converged = false;
      }
    }
    const source = this.pins[this.inputCount].voltSource;
    if (source === null) throw new Error("VCVS output source is unassigned");
    const output = this.evaluateInputs();
    let rightSide = output;
    for (let index = 0; index < this.inputCount; index += 1) {
      let delta = this.volts[index] - this.lastVolts[index];
      if (Math.abs(delta) < 1e-6) delta = 1e-6;
      this.exprState.values[index] = this.volts[index];
      const value = this.expr.eval(this.exprState);
      this.exprState.values[index] = this.volts[index] - delta;
      const previous = this.expr.eval(this.exprState);
      let derivative = (value - previous) / delta;
      if (Math.abs(derivative) < 1e-6) {
        derivative = derivative >= 0 ? 1e-6 : -1e-6;
      }
      CircuitElm.sim.stampMatrix(source, this.nodes[index], -derivative);
      rightSide -= derivative * this.volts[index];
      this.exprState.values[index] = this.volts[index];
    }
    CircuitElm.sim.stampRightSide(source, rightSide);
    for (let index = 0; index < this.inputCount; index += 1) {
      this.lastVolts[index] = this.volts[index];
    }
  }

  public override stepFinished(): void {
    this.exprState.updateLastValues(
      this.volts[this.inputCount] - this.volts[this.inputCount + 1]
    );
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    source.setNodes(
      this.nodes[this.inputCount + 1],
      this.nodes[this.inputCount]
    );
  }

  public override setCurrent(source: VoltageSource, current: number): void {
    if (this.pins[this.inputCount].voltSource === source) {
      this.pins[this.inputCount].current = current;
      this.pins[this.inputCount + 1].current = -current;
    }
  }
}
