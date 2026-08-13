import { CircuitNode } from "./CircuitNode";
import type { DMatrixSparseCSC } from "./matrix/DMatrixSparseCSC";
import type { VoltageSource } from "./VoltageSource";

export interface SparseLinearSolver {
  setA(matrix: DMatrixSparseCSC): boolean;
  solve(rightSide: number[], result: number[]): void;
}

function zeroMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => Array<number>(size).fill(0));
}

/** TypeScript port of the data layout in client/CircuitMatrix.java. */
export class CircuitMatrix {
  public matrix: number[][];
  public rightSide: number[];
  public origRightSide: number[];
  public origMatrix: number[][];
  public permute: number[];
  public size: number;
  public nodeCount = 0;
  public nonLinear = false;
  public nodeVoltages: number[];
  public lastNodeVoltages: number[];
  public sparseLU: SparseLinearSolver | null = null;
  public nodeList: CircuitNode[] = [];
  public voltageSourceList: VoltageSource[] = [];

  public constructor(size = 0) {
    this.size = size;
    this.matrix = zeroMatrix(size);
    this.origMatrix = zeroMatrix(size);
    this.rightSide = Array<number>(size).fill(0);
    this.origRightSide = Array<number>(size).fill(0);
    this.permute = Array<number>(size).fill(0);
    this.nodeVoltages = Array<number>(size).fill(0);
    this.lastNodeVoltages = Array<number>(size).fill(0);
  }

  public clear(): void {
    for (const row of this.matrix) {
      row.fill(0);
    }
    this.rightSide.fill(0);
  }
}
