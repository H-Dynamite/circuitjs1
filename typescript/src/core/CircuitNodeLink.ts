import type { CircuitElm } from "./CircuitElm";

/** Direct TypeScript port of client/CircuitNodeLink.java. */
export class CircuitNodeLink {
  public num = 0;
  public elm: CircuitElm | null = null;
}
