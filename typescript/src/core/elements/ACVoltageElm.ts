import { VoltageElm } from "./VoltageElm";

/** Interactive AC source specialization from ACVoltageElm.java. */
export class ACVoltageElm extends VoltageElm {
  public constructor(x: number, y: number) {
    super(x, y, VoltageElm.WF_AC);
    this.maxVoltage = 120 * Math.sqrt(2);
  }
}
