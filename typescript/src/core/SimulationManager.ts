import { CircuitMatrix } from "./CircuitMatrix";
import { CircuitNode } from "./CircuitNode";
import { DMatrixSparseCSC } from "./matrix/DMatrixSparseCSC";
import { VoltageSource } from "./VoltageSource";

type MatrixEntry = CircuitNode | VoltageSource;

/**
 * First solver-focused slice of SimulationManager.java.
 *
 * Names and in-place behavior deliberately match the Java implementation so
 * callers can be ported class-by-class without an architecture rewrite.
 */
export class SimulationManager {
  public static readonly SOLVER_AUTO = 0;
  public static readonly SOLVER_DENSE = 1;
  public static readonly SOLVER_SPARSE = 2;
  public static readonly SPARSE_THRESHOLD = 150;

  public t = 0;
  public timeStep = 5e-6;
  public maxTimeStep = 5e-6;
  public minTimeStep = 50e-12;
  public adjustTimeStep = false;
  public solverType = SimulationManager.SOLVER_AUTO;
  public usingSparse = false;
  public converged = true;
  public subIterations = 0;

  public static invertMatrix(matrix: number[][], size: number): void {
    const pivot = Array<number>(size).fill(0);
    if (!SimulationManager.lu_factor_dense(matrix, size, pivot)) {
      throw new Error("Cannot invert a singular matrix");
    }

    const inverse = Array.from(
      { length: size },
      () => Array<number>(size).fill(0)
    );
    const rightSide = Array<number>(size).fill(0);

    for (let column = 0; column < size; column += 1) {
      rightSide.fill(0);
      rightSide[column] = 1;
      SimulationManager.lu_solve_dense(
        matrix,
        size,
        pivot,
        rightSide
      );
      for (let row = 0; row < size; row += 1) {
        inverse[row][column] = rightSide[row];
      }
    }

    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        matrix[row][column] = inverse[row][column];
      }
    }
  }

  public static lu_factor(
    matrix: number[][],
    size: number,
    pivot: number[],
    circuitMatrix?: CircuitMatrix
  ): boolean {
    if (circuitMatrix?.sparseLU !== null && circuitMatrix?.sparseLU !== undefined) {
      return circuitMatrix.sparseLU.setA(
        DMatrixSparseCSC.convert(matrix, DMatrixSparseCSC.EPS)
      );
    }
    return SimulationManager.lu_factor_dense(matrix, size, pivot);
  }

  public static lu_factor_dense(
    matrix: number[][],
    size: number,
    pivot: number[]
  ): boolean {
    for (let row = 0; row < size; row += 1) {
      let rowAllZeros = true;
      for (let column = 0; column < size; column += 1) {
        if (matrix[row][column] !== 0) {
          rowAllZeros = false;
          break;
        }
      }
      if (rowAllZeros) {
        return false;
      }
    }

    // Crout factorization with the same partial-pivot selection as Java.
    for (let column = 0; column < size; column += 1) {
      for (let row = 0; row < column; row += 1) {
        let value = matrix[row][column];
        for (let k = 0; k < row; k += 1) {
          value -= matrix[row][k] * matrix[k][column];
        }
        matrix[row][column] = value;
      }

      let largest = 0;
      let largestRow = -1;
      for (let row = column; row < size; row += 1) {
        let value = matrix[row][column];
        for (let k = 0; k < column; k += 1) {
          value -= matrix[row][k] * matrix[k][column];
        }
        matrix[row][column] = value;
        const magnitude = Math.abs(value);
        if (magnitude >= largest) {
          largest = magnitude;
          largestRow = row;
        }
      }

      if (largestRow === -1) {
        return false;
      }

      if (column !== largestRow) {
        const temporary = matrix[largestRow];
        matrix[largestRow] = matrix[column];
        matrix[column] = temporary;
      }

      pivot[column] = largestRow;
      if (matrix[column][column] === 0) {
        return false;
      }

      if (column !== size - 1) {
        const multiplier = 1 / matrix[column][column];
        for (let row = column + 1; row < size; row += 1) {
          matrix[row][column] *= multiplier;
        }
      }
    }
    return true;
  }

  public static lu_solve(
    matrix: number[][],
    size: number,
    pivot: number[],
    rightSide: number[],
    circuitMatrix?: CircuitMatrix
  ): void {
    if (circuitMatrix?.sparseLU !== null && circuitMatrix?.sparseLU !== undefined) {
      circuitMatrix.sparseLU.solve(rightSide, rightSide);
      return;
    }
    SimulationManager.lu_solve_dense(matrix, size, pivot, rightSide);
  }

  public static lu_solve_dense(
    matrix: number[][],
    size: number,
    pivot: number[],
    rightSide: number[]
  ): void {
    let rowIndex = 0;

    for (; rowIndex < size; rowIndex += 1) {
      const row = pivot[rowIndex];
      const swap = rightSide[row];
      rightSide[row] = rightSide[rowIndex];
      rightSide[rowIndex] = swap;
      if (swap !== 0) {
        break;
      }
    }

    const firstNonZero = rowIndex;
    rowIndex += 1;
    for (; rowIndex < size; rowIndex += 1) {
      const row = pivot[rowIndex];
      let total = rightSide[row];
      rightSide[row] = rightSide[rowIndex];
      for (let column = firstNonZero; column < rowIndex; column += 1) {
        total -= matrix[rowIndex][column] * rightSide[column];
      }
      rightSide[rowIndex] = total;
    }

    for (rowIndex = size - 1; rowIndex >= 0; rowIndex -= 1) {
      let total = rightSide[rowIndex];
      for (
        let column = rowIndex + 1;
        column < size;
        column += 1
      ) {
        total -= matrix[rowIndex][column] * rightSide[column];
      }
      rightSide[rowIndex] = total / matrix[rowIndex][rowIndex];
    }
  }

  public stampVCVS(
    n1: CircuitNode,
    n2: CircuitNode,
    coefficient: number,
    voltageSource: VoltageSource
  ): void {
    this.stampMatrix(voltageSource, n1, coefficient);
    this.stampMatrix(voltageSource, n2, -coefficient);
  }

  public stampVoltageSource(
    n1: CircuitNode,
    n2: CircuitNode,
    voltageSource: VoltageSource,
    voltage?: number
  ): void;
  public stampVoltageSource(
    voltageSource: VoltageSource,
    voltage: number
  ): void;
  public stampVoltageSource(
    n1OrSource: CircuitNode | VoltageSource,
    n2OrVoltage: CircuitNode | number,
    source?: VoltageSource,
    voltage?: number
  ): void {
    if (n1OrSource instanceof VoltageSource) {
      if (
        n1OrSource.n1 === null ||
        n1OrSource.n2 === null ||
        typeof n2OrVoltage !== "number"
      ) {
        throw new Error("Voltage source nodes have not been assigned");
      }
      this.stampVoltageSource(
        n1OrSource.n1,
        n1OrSource.n2,
        n1OrSource,
        n2OrVoltage
      );
      return;
    }

    if (!(n2OrVoltage instanceof CircuitNode) || source === undefined) {
      throw new TypeError("Invalid voltage source stamp arguments");
    }

    this.stampMatrix(source, n1OrSource, -1);
    this.stampMatrix(source, n2OrVoltage, 1);
    if (voltage !== undefined) {
      this.stampRightSide(source, voltage);
    }
    this.stampMatrix(n1OrSource, source, 1);
    this.stampMatrix(n2OrVoltage, source, -1);
  }

  public updateVoltageSource(
    _n1: CircuitNode,
    _n2: CircuitNode,
    voltageSource: VoltageSource,
    voltage: number
  ): void {
    this.stampRightSide(voltageSource, voltage);
  }

  public stampResistor(
    n1: CircuitNode,
    n2: CircuitNode,
    resistance: number
  ): void {
    const conductance = 1 / resistance;
    if (!Number.isFinite(conductance)) {
      throw new RangeError(`bad resistance ${resistance} ${conductance}`);
    }
    this.stampConductance(n1, n2, conductance);
  }

  public stampConductance(
    n1: CircuitNode,
    n2: CircuitNode,
    conductance: number
  ): void {
    this.stampMatrix(n1, n1, conductance);
    this.stampMatrix(n2, n2, conductance);
    this.stampMatrix(n1, n2, -conductance);
    this.stampMatrix(n2, n1, -conductance);
  }

  public stampVCCurrentSource(
    currentNode1: CircuitNode,
    currentNode2: CircuitNode,
    voltageNode1: CircuitNode,
    voltageNode2: CircuitNode,
    gain: number
  ): void {
    this.stampMatrix(currentNode1, voltageNode1, gain);
    this.stampMatrix(currentNode2, voltageNode2, gain);
    this.stampMatrix(currentNode1, voltageNode2, -gain);
    this.stampMatrix(currentNode2, voltageNode1, -gain);
  }

  public stampCurrentSource(
    n1: CircuitNode,
    n2: CircuitNode,
    current: number
  ): void {
    this.stampRightSide(n1, -current);
    this.stampRightSide(n2, current);
  }

  public stampCCCS(
    n1: CircuitNode,
    n2: CircuitNode,
    voltageSource: VoltageSource,
    gain: number
  ): void {
    this.stampMatrix(n1, voltageSource, gain);
    this.stampMatrix(n2, voltageSource, -gain);
  }

  public stampMatrix(
    row: CircuitNode,
    column: CircuitNode,
    value: number
  ): void;
  public stampMatrix(
    row: VoltageSource,
    column: CircuitNode,
    value: number
  ): void;
  public stampMatrix(
    row: CircuitNode,
    column: VoltageSource,
    value: number
  ): void;
  public stampMatrix(
    row: VoltageSource,
    column: VoltageSource,
    value: number
  ): void;
  public stampMatrix(
    row: MatrixEntry,
    column: MatrixEntry,
    value: number
  ): void {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Cannot stamp non-finite value ${value}`);
    }

    if (row.row <= 0 || column.row <= 0) {
      return;
    }

    const matrix = row.matrix ?? column.matrix;
    if (matrix === null) {
      throw new Error("Cannot stamp an entry without an assigned matrix");
    }
    if (
      row.matrix !== null &&
      column.matrix !== null &&
      row.matrix !== column.matrix
    ) {
      throw new Error("stampMatrix cross-matrix");
    }
    matrix.matrix[row.row - 1][column.row - 1] += value;
  }

  public stampRightSide(entry: MatrixEntry, value = 0): void {
    if (entry.row <= 0) {
      return;
    }
    if (entry.matrix === null) {
      throw new Error("Cannot stamp an entry without an assigned matrix");
    }
    entry.matrix.rightSide[entry.row - 1] += value;
  }

  public stampNonLinear(_entry: MatrixEntry): void {
    // Kept as a no-op, matching the current Java implementation.
  }
}
