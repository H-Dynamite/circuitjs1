import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";

/** Non-electrical dashed grouping box ported from BoxElm.java. */
export class BoxElm extends CircuitElm {
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
    return "b".charCodeAt(0);
  }

  public override getPostCount(): number {
    return 0;
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return false;
  }

  public override creationFailed(): boolean {
    return Math.abs(this.x2 - this.x) < 32 ||
      Math.abs(this.y2 - this.y) < 32;
  }
}
