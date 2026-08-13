import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

export class ClockElm extends RailElm {
  public constructor(x: number, y: number) {
    super(x, y, VoltageElm.WF_SQUARE);
    this.maxVoltage = 2.5;
    this.bias = 2.5;
    this.frequency = 100;
    this.flags |= RailElm.FLAG_CLOCK;
  }
}
