import { StringTokenizer } from "../StringTokenizer";
import { CurrentElm } from "./CurrentElm";

/** Current-source ohmmeter; resistance is V/I. */
export class OhmMeterElm extends CurrentElm {
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
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags, tokenizer);
  }

  public override getDumpType(): number {
    return 216;
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(26);
  }

  public getResistance(): number {
    return this.current === 0
      ? Number.POSITIVE_INFINITY
      : this.getVoltageDiff() / this.current;
  }
}
