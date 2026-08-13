import { MosfetElm } from "./MosfetElm";

export class PMosfetElm extends MosfetElm {
  public constructor(x: number, y: number) {
    super(x, y, true);
  }
}
