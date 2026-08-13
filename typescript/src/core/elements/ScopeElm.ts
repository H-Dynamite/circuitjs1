import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";

/** Embedded oscilloscope frame; sampled graph data is owned by the UI layer. */
export class ScopeElm extends CircuitElm {
  public scopeState = "";

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
    x2 = x + 128,
    y2 = y + 64,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      this.scopeState = tokenizer.nextToken();
    }
  }

  public override getDumpType(): number {
    return 403;
  }

  public override getPostCount(): number {
    return 0;
  }

  public override dump(): string {
    return this.scopeState.length > 0
      ? `${super.dump()} ${this.scopeState}`
      : super.dump();
  }

  public override canViewInScope(): boolean {
    return false;
  }
}
