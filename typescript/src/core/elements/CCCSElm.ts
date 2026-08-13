import { CircuitElm } from "../CircuitElm";
import { ExprState } from "../Expr";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { ChipElm, ChipPin } from "./ChipElm";
import { VCCSElm } from "./VCCSElm";

/** Expression-controlled current-controlled current source. */
export class CCCSElm extends VCCSElm {
  public static readonly FLAG_SPICE = 2;
  public inputPairCount = 1;
  public lastCurrents: number[] = [0, 0];

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
    const count = Math.max(2, this.inputCount || 2);
    this.inputPairCount = Math.floor(count / 2);
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
    this.pins[count] = new ChipPin(0, ChipElm.SIDE_E, "O+");
    this.pins[count].output = true;
    this.pins[count + 1] = new ChipPin(1, ChipElm.SIDE_E, "O-");
    this.exprState = new ExprState(this.inputPairCount);
    this.lastCurrents = Array(this.inputPairCount + 1).fill(0);
    this.allocNodes();
  }

  public override getChipName(): string {
    return "CCCS";
  }

  public override getDumpType(): number {
    return 215;
  }

  public override getPostCount(): number {
    return this.inputCount + 2;
  }

  public override getVoltageSourceCount(): number {
    return this.inputPairCount;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    source.setNodes(this.nodes[index * 2], this.nodes[index * 2 + 1]);
  }

  public override stamp(): void {
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      const source = this.pins[pair * 2 + 1].voltSource;
      if (source === null) {
        throw new Error("CCCS input source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(
        this.nodes[pair * 2],
        this.nodes[pair * 2 + 1],
        source,
        0
      );
    }
    CircuitElm.sim.stampNonLinear(this.nodes[this.inputCount]);
    CircuitElm.sim.stampNonLinear(this.nodes[this.inputCount + 1]);
  }

  private setCurrentExprValue(index: number, current: number): void {
    if (index === 0 && this.inputPairCount < 9) {
      this.exprState.values[8] = current;
    }
    this.exprState.values[index] = current;
  }

  public override doStep(): void {
    if (this.broken) {
      this.pins[this.inputCount].current = 0;
      this.pins[this.inputCount + 1].current = 0;
      CircuitElm.sim.stampResistor(
        this.nodes[this.inputCount],
        this.nodes[this.inputCount + 1],
        1e8
      );
      return;
    }
    const convergence = this.getConvergeLimit() * 0.1;
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      const current = this.pins[pair * 2 + 1].current;
      if (Math.abs(current - this.lastCurrents[pair]) > convergence) {
        CircuitElm.sim.converged = false;
      }
      this.setCurrentExprValue(pair, current);
    }
    this.exprState.t = CircuitElm.sim.t;
    this.exprState.timeStep = CircuitElm.sim.timeStep;
    const output = this.expr.eval(this.exprState);
    let rightSide = output;
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      const current = this.pins[pair * 2 + 1].current;
      const delta = 1e-6;
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
        throw new Error("CCCS input source is unassigned");
      }
      CircuitElm.sim.stampCCCS(
        this.nodes[this.inputCount + 1],
        this.nodes[this.inputCount],
        inputSource,
        derivative
      );
      rightSide -= derivative * current;
      this.setCurrentExprValue(pair, current);
      this.lastCurrents[pair] = current;
    }
    CircuitElm.sim.stampCurrentSource(
      this.nodes[this.inputCount + 1],
      this.nodes[this.inputCount],
      rightSide
    );
    this.pins[this.inputCount].current = output;
    this.pins[this.inputCount + 1].current = -output;
    this.lastCurrents[this.inputPairCount] = output;
  }

  public override stepFinished(): void {
    this.exprState.updateLastValues(
      this.pins[this.inputCount].current
    );
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    for (let pair = 0; pair < this.inputPairCount; pair += 1) {
      if (this.pins[pair * 2 + 1].voltSource === source) {
        this.pins[pair * 2].current = -current;
        this.pins[pair * 2 + 1].current = current;
        return;
      }
    }
  }

  public override getConnection(first: number, second: number): boolean {
    return Math.floor(first / 2) === Math.floor(second / 2);
  }
}
