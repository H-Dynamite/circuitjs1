import { StringTokenizer } from "../StringTokenizer";
import { DarlingtonElm } from "./DarlingtonElm";

/** NPN drawing-tool variant of DarlingtonElm. */
export class NDarlingtonElm extends DarlingtonElm {
  public constructor(x: number, y: number) {
    super(x, y, x, y, 0, new StringTokenizer("1"));
  }
}
