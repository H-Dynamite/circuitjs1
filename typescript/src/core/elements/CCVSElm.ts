import { CircuitElm } from "../CircuitElm";
import { ExprState } from "../Expr";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { ChipElm, ChipPin } from "./ChipElm";
import { VCCSElm } from "./VCCSElm";

/** Expression-controlled current-controlled voltage source. */
export class CCVSElm extends VCCSElm {
  public inputPairCount = 1;
  public lastCurrents: number[] = [0];
  public lastOutput = 0;
  public outputSource: VoltageSource | null = null;

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
    if (tokenizer === undefined) {
      this.exprString = "2*a";
      this.parseExpr();
    }
    this.setupPins();
  }

  public override setupPins(): void {
    const count = this.inputCount || 2;
    this.inputPairCount = Math.max(1, Math.floor(count / 2));
    this.sizeX = 2;
    this.sizeY = Math.max(count, 2);
    this.pins = Array<ChipPin>(count + 2);
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      this.pins[pair * 2] = new ChipPin(
        pair * 2,
        ChipElm.SIDE_W,
        `${String.fromCharCode(65 + pair)}+`
      );
      this.pins[pair * 2 + 1] = new ChipPin(
        pair * 2 + 1,
        ChipElm.SIDE_W,
        `${String.fromCharCode(65 + pair)}-`
      );
      this.pins[pair * 2 + 1].output = true;
    }
    this.pins[count] = new ChipPin(0, ChipElm.SIDE_E, "V+");
    this.pins[count].output = true;
    this.pins[count + 1] = new ChipPin(1, ChipElm.SIDE_E, "V-");
    this.exprState = new ExprState(this.inputPairCount);
    this.lastCurrents = Array(this.inputPairCount).fill(0);
    this.allocNodes();
  }

  public override getChipName(): string {
    return "CCVS";
  }

  public override getDumpType(): number {
    return 214;
  }

  public override getVoltageSourceCount(): number {
    return 1 + this.inputPairCount;
  }

  public override stamp(): void {
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      const source = this.pins[pair * 2 + 1].voltSource;
      if (source === null) {
        throw new Error("CCVS input measurement source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(
        this.nodes[pair * 2],
        this.nodes[pair * 2 + 1],
        source,
        0
      );
    }
    const output = this.pins[this.inputCount].voltSource;
    if (output === null) throw new Error("CCVS output source is unassigned");
    this.outputSource = output;
    CircuitElm.sim.stampNonLinear(output);
    CircuitElm.sim.stampVoltageSource(
      this.nodes[this.inputCount + 1],
      this.nodes[this.inputCount],
      output
    );
  }

  private setCurrentExprValue(index: number, current: number): void {
    if (index === 0 && this.inputPairCount < 9) {
      this.exprState.values[8] = current;
    }
    this.exprState.values[index] = current;
  }

  public override doStep(): void {
    if (this.outputSource === null) {
      throw new Error("CCVS output source is unassigned");
    }
    const currentLimit = this.getConvergeLimit() * 0.1;
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      if (
        Math.abs(
          this.pins[pair * 2 + 1].current - this.lastCurrents[pair]
        ) > currentLimit
      ) {
        CircuitElm.sim.converged = false;
      }
    }
    if (
      Math.abs(
        this.volts[this.inputCount] -
          this.volts[this.inputCount + 1] -
          this.lastOutput
      ) > this.getConvergeLimit()
    ) {
      CircuitElm.sim.converged = false;
    }
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      this.setCurrentExprValue(
        pair,
        this.pins[pair * 2 + 1].current
      );
    }
    this.exprState.t = CircuitElm.sim.t;
    this.exprState.timeStep = CircuitElm.sim.timeStep;
    const output = this.expr.eval(this.exprState);
    let rightSide = output;
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      const current = this.pins[pair * 2 + 1].current;
      const delta = 1e-9;
      this.setCurrentExprValue(pair, current);
      const value = this.expr.eval(this.exprState);
      this.setCurrentExprValue(pair, current - delta);
      const previous = this.expr.eval(this.exprState);
      let derivative = (value - previous) / delta;
      if (Math.abs(derivative) < 1e-6) {
        derivative = derivative >= 0 ? 1e-6 : -1e-6;
      }
      const inputSource = this.pins[pair * 2 + 1].voltSource;
      if (inputSource === null) {
        throw new Error("CCVS input source is unassigned");
      }
      CircuitElm.sim.stampMatrix(
        this.outputSource,
        inputSource,
        -derivative
      );
      rightSide -= derivative * current;
      this.setCurrentExprValue(pair, current);
    }
    CircuitElm.sim.stampRightSide(this.outputSource, rightSide);
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      this.lastCurrents[pair] = this.pins[pair * 2 + 1].current;
    }
    this.lastOutput =
      this.volts[this.inputCount] - this.volts[this.inputCount + 1];
  }

  public override stepFinished(): void {
    this.exprState.updateLastValues(
      this.volts[this.inputCount] - this.volts[this.inputCount + 1]
    );
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      this.exprState.lastValues[pair] =
        this.pins[pair * 2 + 1].current;
    }
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    if (index < this.inputPairCount) {
      source.setNodes(this.nodes[index * 2], this.nodes[index * 2 + 1]);
    } else {
      source.setNodes(
        this.nodes[this.inputCount + 1],
        this.nodes[this.inputCount]
      );
    }
  }

  public override setCurrent(source: VoltageSource, current: number): void {
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      if (this.pins[pair * 2 + 1].voltSource === source) {
        this.pins[pair * 2].current = -current;
        this.pins[pair * 2 + 1].current = current;
        return;
      }
    }
    if (this.pins[this.inputCount].voltSource === source) {
      this.pins[this.inputCount].current = current;
      this.pins[this.inputCount + 1].current = -current;
    }
  }

  public override getConnection(first: number, second: number): boolean {
    return Math.floor(first / 2) === Math.floor(second / 2);
  }
}
