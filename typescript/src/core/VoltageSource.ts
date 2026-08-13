import type { CircuitElm } from "./CircuitElm";
import { CircuitMatrix } from "./CircuitMatrix";
import { CircuitNode } from "./CircuitNode";

/** Direct TypeScript port of client/VoltageSource.java. */
export class VoltageSource {
  public index = 0;
  public elm: CircuitElm | null = null;
  public matrix: CircuitMatrix | null = null;
  public row = 0;
  public n1: CircuitNode | null = null;
  public n2: CircuitNode | null = null;

  public setNodes(n1: CircuitNode, n2: CircuitNode): void {
    this.n1 = n1;
    this.n2 = n2;
  }

  public assignMatrix(): void {
    if (
      this.n1 !== null &&
      this.n1 !== CircuitNode.ground &&
      this.n1.matrix !== null
    ) {
      this.matrix = this.n1.matrix;
    } else if (
      this.n2 !== null &&
      this.n2 !== CircuitNode.ground &&
      this.n2.matrix !== null
    ) {
      this.matrix = this.n2.matrix;
    } else if (this.elm !== null) {
      this.matrix =
        this.elm.getNode(this.elm.getPostCount() - 1).matrix;
    }

    if (this.matrix === null) {
      throw new Error(`null matrix! voltage source ${this.index}`);
    }
  }
}
