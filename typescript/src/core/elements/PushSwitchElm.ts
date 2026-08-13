import { SwitchElm } from "./SwitchElm";

export class PushSwitchElm extends SwitchElm {
  public constructor(x: number, y: number) {
    super(x, y, true);
  }
}
