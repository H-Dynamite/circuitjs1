import { StringTokenizer } from "../StringTokenizer";
import { AndGateElm } from "./AndGateElm";

export class NandGateElm extends AndGateElm {
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
  }

  public override getDumpType(): number {
    return 151;
  }

  public override getGateName(): string {
    return "NAND";
  }

  public override isInverting(): boolean {
    return true;
  }
}
