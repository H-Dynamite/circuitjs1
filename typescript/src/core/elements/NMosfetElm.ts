import { MosfetElm } from "./MosfetElm";

export class NMosfetElm extends MosfetElm {
  public constructor(x: number, y: number) {
    super(x, y, false);
  }
}
