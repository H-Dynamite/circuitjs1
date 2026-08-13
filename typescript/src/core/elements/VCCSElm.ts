import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { CustomLogicModel } from "../CustomLogicModel";
import { Expr, ExprParser, ExprState } from "../Expr";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Expression-controlled voltage-controlled current source. */
export class VCCSElm extends ChipElm {
  public inputCount = 2;
  public exprString = ".1*(a-b)";
  public expr: Expr = new Expr(() => 0);
  public exprState = new ExprState(2);
  public lastVolts: number[] = [0, 0];
  public broken = false;

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
    const tokens = tokenizer ?? new StringTokenizer("");
    super(x, y, x2, y2, flags, tokens);
    if (tokens.hasMoreTokens()) {
      const count = Number.parseInt(tokens.nextToken(), 10);
      this.inputCount = Number.isFinite(count) ? count : 2;
    }
    if (tokens.hasMoreTokens()) {
      this.exprString = CustomLogicModel.unescape(tokens.nextToken());
    }
    this.parseExpr();
    this.setupPins();
  }

  public parseExpr(): void {
    const parser = new ExprParser(this.exprString);
    this.expr = parser.parseExpression();
    if (parser.gotError() !== null) {
      this.expr = new Expr(() => 0);
    }
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
    this.pins[count] = new ChipPin(0, ChipElm.SIDE_E, "C+");
    this.pins[count + 1] = new ChipPin(1, ChipElm.SIDE_E, "C-");
    this.lastVolts = Array(count).fill(0);
    this.exprState = new ExprState(count);
    this.allocNodes();
  }

  public override getChipName(): string {
    return "VCCS";
  }

  public override getPostCount(): number {
    return (Number.isInteger(this.inputCount) ? this.inputCount : 2) + 2;
  }

  public override getVoltageSourceCount(): number {
    return 0;
  }

  public override getDumpType(): number {
    return 213;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.inputCount} ` +
      CustomLogicModel.escape(this.exprString)
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ic", this.inputCount);
    XMLSerializer.dumpAttr(element, "ex", this.exprString);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.inputCount = xml.parseIntAttr("ic", this.inputCount);
    this.exprString =
      xml.parseStringAttr("ex", this.exprString) ?? this.exprString;
    this.parseExpr();
    this.setupPins();
  }

  public override stamp(): void {
    CircuitElm.sim.stampNonLinear(this.nodes[this.inputCount]);
    CircuitElm.sim.stampNonLinear(this.nodes[this.inputCount + 1]);
  }

  public getConvergeLimit(): number {
    if (CircuitElm.sim.subIterations < 10) return 0.001;
    if (CircuitElm.sim.subIterations < 200) return 0.01;
    return 0.1;
  }

  protected evaluateInputs(): number {
    for (let index = 0; index < this.inputCount; index += 1) {
      this.exprState.values[index] = this.volts[index];
    }
    this.exprState.t = CircuitElm.sim.t;
    this.exprState.timeStep = CircuitElm.sim.timeStep;
    return this.expr.eval(this.exprState);
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
    const convergence = this.getConvergeLimit();
    for (let index = 0; index < this.inputCount; index += 1) {
      if (Math.abs(this.volts[index] - this.lastVolts[index]) > convergence) {
        CircuitElm.sim.converged = false;
      }
    }
    const output = -this.evaluateInputs();
    let rightSide = output;
    for (let index = 0; index < this.inputCount; index += 1) {
      let delta = this.volts[index] - this.lastVolts[index];
      if (Math.abs(delta) < 1e-6) delta = 1e-6;
      this.exprState.values[index] = this.volts[index];
      const value = -this.expr.eval(this.exprState);
      this.exprState.values[index] = this.volts[index] - delta;
      const previous = -this.expr.eval(this.exprState);
      let derivative = (value - previous) / delta;
      if (Math.abs(derivative) < 1e-6) {
        derivative = derivative >= 0 ? 1e-6 : -1e-6;
      }
      CircuitElm.sim.stampVCCurrentSource(
        this.nodes[this.inputCount],
        this.nodes[this.inputCount + 1],
        this.nodes[index],
        CircuitNode.ground,
        derivative
      );
      rightSide -= derivative * this.volts[index];
      this.exprState.values[index] = this.volts[index];
    }
    CircuitElm.sim.stampCurrentSource(
      this.nodes[this.inputCount],
      this.nodes[this.inputCount + 1],
      rightSide
    );
    this.pins[this.inputCount].current = -output;
    this.pins[this.inputCount + 1].current = output;
    for (let index = 0; index < this.inputCount; index += 1) {
      this.lastVolts[index] = this.volts[index];
    }
  }

  public override stepFinished(): void {
    this.exprState.updateLastValues(this.pins[this.inputCount].current);
  }

  public override reset(): void {
    super.reset();
    this.exprState?.reset();
    this.lastVolts?.fill(0);
  }

  public override getConnection(first: number, second: number): boolean {
    return this.comparePair(
      first,
      second,
      this.inputCount,
      this.inputCount + 1
    );
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override hasGroundConnection(_index: number): boolean {
    return false;
  }
}
