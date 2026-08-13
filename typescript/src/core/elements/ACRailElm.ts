import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

export class ACRailElm extends RailElm {
  public constructor(x: number, y: number) {
    super(x, y, VoltageElm.WF_AC);
    this.maxVoltage = 120 * Math.sqrt(2);
  }
}
