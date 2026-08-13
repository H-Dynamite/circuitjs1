import { TransistorElm } from "./TransistorElm";

export class PTransistorElm extends TransistorElm {
  public constructor(x: number, y: number) {
    super(x, y, true);
  }
}
