import { StringTokenizer } from "../StringTokenizer";
import { InvertingSchmittElm } from "./InvertingSchmittElm";

/** Non-inverting hysteretic logic buffer ported from SchmittElm.java. */
export class SchmittElm extends InvertingSchmittElm {
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
    super(
      x,
      y,
      x2,
      y2,
      flags,
      tokenizer ?? new StringTokenizer("")
    );
  }

  public override getDumpType(): number {
    return 182;
  }

  protected override getDesiredOutput(input: number): number {
    if (this.state) {
      if (input > this.upperTrigger) this.state = false;
    } else if (input < this.lowerTrigger) {
      this.state = true;
    }
    return this.state ? this.logicOffLevel : this.logicOnLevel;
  }
}
