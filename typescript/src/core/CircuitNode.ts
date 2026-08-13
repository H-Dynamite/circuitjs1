import type { CircuitMatrix } from "./CircuitMatrix";
import { CircuitNodeLink } from "./CircuitNodeLink";

/** Direct TypeScript port of client/CircuitNode.java. */
export class CircuitNode {
  public static ground: CircuitNode;

  public links: CircuitNodeLink[] = [];
  public internal = false;
  public index = 0;
  public matrix: CircuitMatrix | null = null;
  /** Row in the matrix; row zero is ground and is excluded. */
  public row = 0;

  public toString(): string {
    return `node ${this.index}`;
  }
}

CircuitNode.ground = new CircuitNode();
