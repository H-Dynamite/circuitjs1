import { OpAmpElm } from "./OpAmpElm";

/** Op-amp drawing-tool variant with swapped input placement. */
export class OpAmpSwapElm extends OpAmpElm {
  public constructor(x: number, y: number) {
    super(x, y);
    this.flags |= OpAmpElm.FLAG_SWAP;
  }
}
