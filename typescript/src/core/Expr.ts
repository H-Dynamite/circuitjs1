/** Mutable input/history state used by CircuitJS custom expressions. */
export class ExprState {
  public values = Array<number>(9).fill(0);
  public lastValues = Array<number>(9).fill(0);
  public lastOutput = 0;
  public t = 0;
  public timeStep = 1;

  public constructor(_inputCount = 0) {
    // The original reserves e at input slot E.
    this.values[4] = Math.E;
  }

  public updateLastValues(lastOutput: number): void {
    this.lastOutput = lastOutput;
    this.lastValues = [...this.values];
  }

  public reset(): void {
    this.lastValues.fill(0);
    this.lastOutput = 0;
  }
}

type UnaryFunction = (value: number) => number;
type EvalFunction = (state: ExprState) => number;

/** Compiled, dependency-free expression compatible with Expr.java syntax. */
export class Expr {
  public constructor(private readonly evaluator: EvalFunction) {}

  public eval(state: ExprState): number {
    const value = this.evaluator(state);
    return Number.isNaN(value) ? 0 : value;
  }
}

/**
 * Recursive-descent parser for CircuitJS behavioral expressions.
 * It deliberately avoids JavaScript eval so circuit files cannot execute code.
 */
export class ExprParser {
  private position = 0;
  private token = "";
  private error: string | null = null;
  private readonly text: string;

  public constructor(source: string) {
    this.text = source.toLowerCase();
    this.nextToken();
  }

  public parseExpression(): Expr {
    if (this.token.length === 0) return new Expr(() => 0);
    const expression = this.parseTernary();
    if (this.token.length > 0) {
      this.setError(`unexpected token: ${this.token}`);
    }
    return new Expr(expression);
  }

  public gotError(): string | null {
    return this.error;
  }

  private nextToken(): void {
    while (this.position < this.text.length && /\s/.test(this.text[this.position])) {
      this.position += 1;
    }
    if (this.position >= this.text.length) {
      this.token = "";
      return;
    }
    const rest = this.text.slice(this.position);
    const number = rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/);
    const identifier = rest.match(/^[a-z]+/);
    const operator = rest.match(/^(?:\|\||&&|>>|==|!=|<=|>=|.)/);
    const match = number ?? identifier ?? operator;
    this.token = match?.[0] ?? "";
    this.position += this.token.length;
  }

  private skip(value: string): boolean {
    if (this.token !== value) return false;
    this.nextToken();
    return true;
  }

  private require(value: string): void {
    if (!this.skip(value)) {
      this.setError(`expected ${value}, got ${this.token}`);
    }
  }

  private setError(message: string): void {
    this.error ??= message;
  }

  private parseTernary(): EvalFunction {
    const condition = this.parseOr();
    if (!this.skip("?")) return condition;
    const yes = this.parseOr();
    this.require(":");
    const no = this.parseTernary();
    return (state) => (condition(state) !== 0 ? yes(state) : no(state));
  }

  private parseOr(): EvalFunction {
    let left = this.parseAnd();
    while (this.skip("||")) {
      const previous = left;
      const right = this.parseAnd();
      left = (state) =>
        previous(state) !== 0 || right(state) !== 0 ? 1 : 0;
    }
    return left;
  }

  private parseAnd(): EvalFunction {
    let left = this.parseBitOr();
    while (this.skip("&&")) {
      const previous = left;
      const right = this.parseBitOr();
      left = (state) =>
        previous(state) !== 0 && right(state) !== 0 ? 1 : 0;
    }
    return left;
  }

  private parseBitOr(): EvalFunction {
    let left = this.parseBitAnd();
    while (this.skip("|")) {
      const previous = left;
      const right = this.parseBitAnd();
      left = (state) => (previous(state) | right(state)) >>> 0;
    }
    return left;
  }

  private parseBitAnd(): EvalFunction {
    let left = this.parseEquals();
    while (this.skip("&")) {
      const previous = left;
      const right = this.parseEquals();
      left = (state) => previous(state) & right(state);
    }
    return left;
  }

  private parseEquals(): EvalFunction {
    let left = this.parseCompare();
    while (this.token === "==" || this.token === "!=") {
      const operator = this.token;
      this.nextToken();
      const previous = left;
      const right = this.parseCompare();
      left = (state) =>
        (operator === "=="
          ? previous(state) === right(state)
          : previous(state) !== right(state))
          ? 1
          : 0;
    }
    return left;
  }

  private parseCompare(): EvalFunction {
    let left = this.parseShift();
    while (["<", ">", "<=", ">="].includes(this.token)) {
      const operator = this.token;
      this.nextToken();
      const previous = left;
      const right = this.parseShift();
      left = (state) => {
        const a = previous(state);
        const b = right(state);
        if (operator === "<") return a < b ? 1 : 0;
        if (operator === ">") return a > b ? 1 : 0;
        if (operator === "<=") return a <= b ? 1 : 0;
        return a >= b ? 1 : 0;
      };
    }
    return left;
  }

  private parseShift(): EvalFunction {
    let left = this.parseAdd();
    while (this.skip(">>")) {
      const previous = left;
      const right = this.parseAdd();
      left = (state) => previous(state) >> right(state);
    }
    return left;
  }

  private parseAdd(): EvalFunction {
    let left = this.parseMultiply();
    while (this.token === "+" || this.token === "-") {
      const operator = this.token;
      this.nextToken();
      const previous = left;
      const right = this.parseMultiply();
      left =
        operator === "+"
          ? (state) => previous(state) + right(state)
          : (state) => previous(state) - right(state);
    }
    return left;
  }

  private parseMultiply(): EvalFunction {
    let left = this.parseUnary();
    while (this.token === "*" || this.token === "/") {
      const operator = this.token;
      this.nextToken();
      const previous = left;
      const right = this.parseUnary();
      left =
        operator === "*"
          ? (state) => previous(state) * right(state)
          : (state) => previous(state) / right(state);
    }
    return left;
  }

  private parseUnary(): EvalFunction {
    this.skip("+");
    if (this.skip("!")) {
      const value = this.parseUnary();
      return (state) => (value(state) === 0 ? 1 : 0);
    }
    if (this.skip("-")) {
      const value = this.parseUnary();
      return (state) => -value(state);
    }
    return this.parsePower();
  }

  private parsePower(): EvalFunction {
    let left = this.parseTerm();
    while (this.skip("^")) {
      const previous = left;
      const right = this.parseTerm();
      left = (state) => Math.pow(previous(state), right(state));
    }
    return left;
  }

  private parseTerm(): EvalFunction {
    if (this.skip("(")) {
      const expression = this.parseTernary();
      this.require(")");
      return expression;
    }
    if (this.skip("t")) return (state) => state.t;
    if (this.skip("pi")) return () => Math.PI;
    if (this.skip("lastoutput")) return (state) => state.lastOutput;
    if (this.skip("timestep")) return (state) => state.timeStep;

    if (/^[a-i]$/.test(this.token)) {
      const index = this.token.charCodeAt(0) - 97;
      this.nextToken();
      return (state) => state.values[index];
    }
    if (/^last[a-i]$/.test(this.token)) {
      const index = this.token.charCodeAt(4) - 97;
      this.nextToken();
      return (state) => state.lastValues[index];
    }
    if (/^d[a-i]dt$/.test(this.token)) {
      const index = this.token.charCodeAt(1) - 97;
      this.nextToken();
      return (state) =>
        (state.values[index] - state.lastValues[index]) / state.timeStep;
    }

    const unaryFunctions: Record<string, UnaryFunction> = {
      sin: Math.sin,
      cos: Math.cos,
      asin: Math.asin,
      acos: Math.acos,
      atan: Math.atan,
      sinh: Math.sinh,
      cosh: Math.cosh,
      tanh: Math.tanh,
      abs: Math.abs,
      exp: Math.exp,
      log: Math.log,
      sqrt: Math.sqrt,
      tan: Math.tan,
      floor: Math.floor,
      ceil: Math.ceil,
      tri: (value) => {
        const phase = ExprParser.positiveModulo(value, 2 * Math.PI) / Math.PI;
        return phase < 1 ? -1 + phase * 2 : 3 - phase * 2;
      },
      saw: (value) =>
        ExprParser.positiveModulo(value, 2 * Math.PI) / Math.PI - 1
    };
    const unary = unaryFunctions[this.token];
    if (unary !== undefined) {
      this.nextToken();
      this.require("(");
      const argument = this.parseTernary();
      this.require(")");
      return (state) => unary(argument(state));
    }

    if (
      [
        "min",
        "max",
        "pwl",
        "mod",
        "step",
        "select",
        "clamp",
        "pwr",
        "pwrs"
      ].includes(this.token)
    ) {
      const name = this.token;
      this.nextToken();
      const args = this.parseArguments();
      return this.compileFunction(name, args);
    }

    const value = Number(this.token);
    if (Number.isFinite(value)) {
      this.nextToken();
      return () => value;
    }
    this.setError(
      this.token.length === 0
        ? "unexpected end of input"
        : `unrecognized token: ${this.token}`
    );
    if (this.token.length > 0) this.nextToken();
    return () => 0;
  }

  private parseArguments(): EvalFunction[] {
    this.require("(");
    const argumentsList: EvalFunction[] = [];
    if (this.skip(")")) return argumentsList;
    argumentsList.push(this.parseTernary());
    while (this.skip(",")) argumentsList.push(this.parseTernary());
    this.require(")");
    return argumentsList;
  }

  private compileFunction(name: string, args: EvalFunction[]): EvalFunction {
    if (name === "min") {
      return (state) => Math.min(...args.map((arg) => arg(state)));
    }
    if (name === "max") {
      return (state) => Math.max(...args.map((arg) => arg(state)));
    }
    if (name === "mod") {
      return (state) => args[0](state) % args[1](state);
    }
    if (name === "clamp") {
      return (state) =>
        Math.min(
          Math.max(args[0](state), args[1](state)),
          args[2](state)
        );
    }
    if (name === "step") {
      return (state) => {
        const value = args[0](state);
        if (value < 0) return 0;
        return args.length < 2 || value <= args[1](state) ? 1 : 0;
      };
    }
    if (name === "select") {
      return (state) =>
        args[0](state) > 0 ? args[2](state) : args[1](state);
    }
    if (name === "pwr") {
      return (state) =>
        Math.pow(Math.abs(args[0](state)), args[1](state));
    }
    if (name === "pwrs") {
      return (state) => {
        const value = args[0](state);
        return Math.sign(value) *
          Math.pow(Math.abs(value), args[1](state));
      };
    }
    if (name === "pwl") {
      return (state) => {
        const x = args[0](state);
        let x0 = args[1](state);
        let y0 = args[2](state);
        if (x < x0) return y0;
        for (let index = 3; index + 1 < args.length; index += 2) {
          const x1 = args[index](state);
          const y1 = args[index + 1](state);
          if (x < x1) {
            return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
          }
          x0 = x1;
          y0 = y1;
        }
        return y0;
      };
    }
    return () => 0;
  }

  private static positiveModulo(value: number, divisor: number): number {
    const result = value % divisor;
    return result >= 0 ? result : result + divisor;
  }
}
