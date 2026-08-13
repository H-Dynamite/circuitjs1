import { VoltageElm } from "./VoltageElm";

/** Interactive DC source specialization from DCVoltageElm.java. */
export class DCVoltageElm extends VoltageElm {
  public constructor(x: number, y: number) {
    super(x, y, VoltageElm.WF_DC);
  }
}
