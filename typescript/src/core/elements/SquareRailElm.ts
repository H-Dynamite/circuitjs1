import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

/** Interactive square-wave rail specialization. */
export class SquareRailElm extends RailElm {
  public constructor(x: number, y: number) {
    super(x, y, VoltageElm.WF_SQUARE);
  }
}
