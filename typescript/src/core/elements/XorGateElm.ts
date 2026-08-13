import { StringTokenizer } from "../StringTokenizer";
import { GateElm } from "./GateElm";

export class XorGateElm extends GateElm {
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
    return 154;
  }

  public override getGateName(): string {
    return "XOR";
  }

  public override calcFunction(): boolean {
    let result = false;
    for (let index = 0; index < this.inputCount; index += 1) {
      result = result !== this.getInput(index);
    }
    return result;
  }
}
