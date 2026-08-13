import { StringTokenizer } from "../StringTokenizer";
import { XorGateElm } from "./XorGateElm";

/** Inverting XOR gate. */
export class XnorGateElm extends XorGateElm {
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

  public override getGateName(): string {
    return "XNOR";
  }

  public override isInverting(): boolean {
    return true;
  }

  public override getDumpType(): number {
    return 431;
  }
}
