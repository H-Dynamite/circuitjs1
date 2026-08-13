import { TransistorElm } from "./TransistorElm";

export class NTransistorElm extends TransistorElm {
  public constructor(x: number, y: number) {
    super(x, y, false);
  }
}
