import { StringTokenizer } from "../StringTokenizer";
import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

export class NoiseElm extends RailElm {
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
    y2?: number,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    if (y2 === undefined) {
      super(x, y, VoltageElm.WF_NOISE);
    } else {
      super(
        x,
        y,
        x2,
        y2,
        flags,
        tokenizer ?? new StringTokenizer("")
      );
      this.waveform = VoltageElm.WF_NOISE;
    }
  }
}
