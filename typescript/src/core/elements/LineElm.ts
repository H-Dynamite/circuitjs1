import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";

/** Non-electrical annotation line. */
export class LineElm extends CircuitElm {
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
    _tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
  }

  public override getDumpType(): number {
    return 423;
  }

  public override getPostCount(): number {
    return 0;
  }

  public override canViewInScope(): boolean {
    return false;
  }
}
