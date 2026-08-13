import { DGrowArray } from "./DGrowArray";
import { DMatrixSparseCSC } from "./DMatrixSparseCSC";
import { IGrowArray } from "./IGrowArray";

/**
 * Sparse LU decomposition ported directly from matrix/SparseLU.java.
 * The algorithm and public method names stay aligned with the Java version.
 */
export class SparseLU {
  private readonly gw = new IGrowArray();
  private readonly L = new DMatrixSparseCSC(0, 0, 0);
  private readonly U = new DMatrixSparseCSC(0, 0, 0);
  private x: number[] = [];
  private readonly gxi = new IGrowArray();
  private pinv: number[] = [];
  private singular = false;
  private readonly gx = new DGrowArray();
  private readonly gb = new DGrowArray();
  private AnumRows = 0;
  private AnumCols = 0;

  private initialize(matrix: DMatrixSparseCSC): void {
    const rows = matrix.numRows;
    const columns = matrix.numCols;
    const diagonalSize = Math.min(rows, columns);
    this.L.reshape(
      rows,
      rows,
      4 * matrix.nz_length + diagonalSize
    );
    this.U.reshape(
      rows,
      columns,
      4 * matrix.nz_length + diagonalSize
    );
    this.singular = false;

    if (this.pinv.length !== rows) {
      this.pinv = Array<number>(rows).fill(-1);
      this.x = Array<number>(rows).fill(0);
    }
    for (let row = 0; row < rows; row += 1) {
      this.pinv[row] = -1;
      this.L.col_idx[row] = 0;
      this.x[row] = 0;
    }
  }

  private performLU(matrix: DMatrixSparseCSC): boolean {
    const rows = matrix.numRows;
    const columns = matrix.numCols;
    const work = SparseLU.adjust(this.gw, rows * 2, rows);

    let column: number;
    for (column = 0; column < columns; column += 1) {
      this.L.col_idx[column] = this.L.nz_length;
      this.U.col_idx[column] = this.U.nz_length;
      if (this.L.nz_length + columns > this.L.nz_values.length) {
        this.L.growMaxLength(
          2 * this.L.nz_values.length + columns,
          true
        );
      }
      if (this.U.nz_length + columns > this.U.nz_values.length) {
        this.U.growMaxLength(
          2 * this.U.nz_values.length + columns,
          true
        );
      }

      const top = SparseLU.solveColB(
        this.L,
        true,
        matrix,
        column,
        this.x,
        this.pinv,
        this.gxi,
        work
      );
      const xi = this.gxi.data;
      let pivotRow = -1;
      let largest = -Number.MAX_VALUE;

      for (let index = top; index < columns; index += 1) {
        const row = xi[index];
        if (this.pinv[row] < 0) {
          const magnitude = Math.abs(this.x[row]);
          if (magnitude > largest) {
            largest = magnitude;
            pivotRow = row;
          }
        } else {
          this.U.nz_rows[this.U.nz_length] = this.pinv[row];
          this.U.nz_values[this.U.nz_length] = this.x[row];
          this.U.nz_length += 1;
        }
      }

      if (pivotRow === -1 || largest <= 0) {
        this.singular = true;
        return false;
      }

      const pivot = this.x[pivotRow];
      this.U.nz_rows[this.U.nz_length] = column;
      this.U.nz_values[this.U.nz_length] = pivot;
      this.U.nz_length += 1;
      this.pinv[pivotRow] = column;
      this.L.nz_rows[this.L.nz_length] = pivotRow;
      this.L.nz_values[this.L.nz_length] = 1;
      this.L.nz_length += 1;

      for (let index = top; index < columns; index += 1) {
        const row = xi[index];
        if (this.pinv[row] < 0) {
          this.L.nz_rows[this.L.nz_length] = row;
          this.L.nz_values[this.L.nz_length] = this.x[row] / pivot;
          this.L.nz_length += 1;
        }
        this.x[row] = 0;
      }
    }

    this.L.col_idx[columns] = this.L.nz_length;
    this.U.col_idx[columns] = this.U.nz_length;
    for (column = 0; column < this.L.nz_length; column += 1) {
      this.L.nz_rows[column] = this.pinv[this.L.nz_rows[column]];
    }
    return true;
  }

  public setA(matrix: DMatrixSparseCSC): boolean {
    this.AnumRows = matrix.numRows;
    this.AnumCols = matrix.numCols;
    return this.decompose(matrix);
  }

  public decompose(matrix: DMatrixSparseCSC): boolean {
    this.initialize(matrix);
    return this.performLU(matrix);
  }

  public solve(rightSide: number[], result: number[]): void {
    if (rightSide.length !== this.AnumRows) {
      throw new RangeError(
        "Unexpected number of rows in B based on shape of A. " +
          `Found=${rightSide.length} Expected=${this.AnumRows}`
      );
    }
    if (result.length !== this.AnumCols) {
      throw new RangeError(
        "Unexpected result length based on shape of A. " +
          `Found=${result.length} Expected=${this.AnumCols}`
      );
    }

    const x = SparseLU.adjust(this.gx, result.length);
    const copy = SparseLU.adjust(this.gb, rightSide.length);
    for (let index = 0; index < rightSide.length; index += 1) {
      copy[index] = rightSide[index];
    }

    SparseLU.permuteInv(this.pinv, copy, x, result.length);
    SparseLU.solveL(this.L, x);
    SparseLU.solveU(this.U, x);
    for (let index = 0; index < result.length; index += 1) {
      result[index] = x[index];
    }
  }

  public static solveColB(
    triangular: DMatrixSparseCSC,
    lower: boolean,
    rightSide: DMatrixSparseCSC,
    rightSideColumn: number,
    x: number[],
    inversePermutation: number[] | null,
    growXi: IGrowArray,
    work: number[]
  ): number {
    const rowCount = triangular.numCols;
    const xi = SparseLU.adjust(growXi, rowCount);
    const top = SparseLU.searchNzRowsInX(
      triangular,
      rightSide,
      rightSideColumn,
      inversePermutation,
      xi,
      work
    );

    for (let index = top; index < rowCount; index += 1) {
      x[xi[index]] = 0;
    }

    const start = rightSide.col_idx[rightSideColumn];
    const end = rightSide.col_idx[rightSideColumn + 1];
    for (let index = start; index < end; index += 1) {
      x[rightSide.nz_rows[index]] = rightSide.nz_values[index];
    }

    for (let index = top; index < rowCount; index += 1) {
      const row = xi[index];
      const column =
        inversePermutation !== null ? inversePermutation[row] : row;
      if (column < 0) {
        continue;
      }

      let entry: number;
      let entryEnd: number;
      if (lower) {
        x[row] /= triangular.nz_values[triangular.col_idx[column]];
        entry = triangular.col_idx[column] + 1;
        entryEnd = triangular.col_idx[column + 1];
      } else {
        x[row] /=
          triangular.nz_values[triangular.col_idx[column + 1] - 1];
        entry = triangular.col_idx[column];
        entryEnd = triangular.col_idx[column + 1] - 1;
      }

      while (entry < entryEnd) {
        const targetRow = triangular.nz_rows[entry];
        x[targetRow] -= triangular.nz_values[entry] * x[row];
        entry += 1;
      }
    }
    return top;
  }

  public static searchNzRowsInX(
    triangular: DMatrixSparseCSC,
    rightSide: DMatrixSparseCSC,
    rightSideColumn: number,
    inversePermutation: number[] | null,
    xi: number[],
    work: number[]
  ): number {
    const rowCount = triangular.numCols;
    if (xi.length < rowCount) {
      throw new RangeError(
        `xi must be at least G.numCols=${triangular.numCols}`
      );
    }
    if (work.length < 2 * rowCount) {
      throw new RangeError(
        "w must be at least 2*G.numCols in length"
      );
    }

    const start = rightSide.col_idx[rightSideColumn];
    const end = rightSide.col_idx[rightSideColumn + 1];
    let top = rowCount;
    for (let index = start; index < end; index += 1) {
      const row = rightSide.nz_rows[index];
      if (row < rowCount && work[row] === 0) {
        top = SparseLU.searchNzRowsInX_DFS(
          row,
          triangular,
          top,
          inversePermutation,
          xi,
          work
        );
      }
    }
    for (let index = top; index < rowCount; index += 1) {
      work[xi[index]] = 0;
    }
    return top;
  }

  private static searchNzRowsInX_DFS(
    rightSideRow: number,
    triangular: DMatrixSparseCSC,
    initialTop: number,
    inversePermutation: number[] | null,
    xi: number[],
    work: number[]
  ): number {
    const size = triangular.numCols;
    let head = 0;
    let top = initialTop;
    xi[head] = rightSideRow;

    while (head >= 0) {
      const originalColumn = xi[head];
      const column =
        inversePermutation !== null
          ? inversePermutation[originalColumn]
          : originalColumn;
      if (work[originalColumn] === 0) {
        work[originalColumn] = 1;
        work[size + head] =
          column >= 0 && column < size
            ? triangular.col_idx[column]
            : 0;
      }

      let done = true;
      const start = work[size + head];
      const end =
        column >= 0 && column < size
          ? triangular.col_idx[column + 1]
          : 0;
      for (let index = start; index < end; index += 1) {
        const row = triangular.nz_rows[index];
        if (row < size && work[row] === 0) {
          work[size + head] = index + 1;
          head += 1;
          xi[head] = row;
          done = false;
          break;
        }
      }

      if (done) {
        head -= 1;
        top -= 1;
        xi[top] = originalColumn;
      }
    }
    return top;
  }

  public static solveL(matrix: DMatrixSparseCSC, x: number[]): void {
    const size = matrix.numCols;
    let start = matrix.col_idx[0];
    for (let column = 0; column < size; column += 1) {
      const end = matrix.col_idx[column + 1];
      x[column] /= matrix.nz_values[start];
      const value = x[column];
      for (let index = start + 1; index < end; index += 1) {
        const row = matrix.nz_rows[index];
        x[row] -= matrix.nz_values[index] * value;
      }
      start = end;
    }
  }

  public static solveU(matrix: DMatrixSparseCSC, x: number[]): void {
    const size = matrix.numCols;
    let end = matrix.col_idx[size];
    for (let column = size - 1; column >= 0; column -= 1) {
      const start = matrix.col_idx[column];
      x[column] /= matrix.nz_values[end - 1];
      const value = x[column];
      for (let index = start; index < end - 1; index += 1) {
        const row = matrix.nz_rows[index];
        x[row] -= matrix.nz_values[index] * value;
      }
      end = start;
    }
  }

  public static adjust(
    work: IGrowArray,
    desired: number,
    zeroTo?: number
  ): number[];
  public static adjust(work: DGrowArray, desired: number): number[];
  public static adjust(
    work: IGrowArray | DGrowArray,
    desired: number,
    zeroTo?: number
  ): number[] {
    work.reshape(desired);
    if (zeroTo !== undefined) {
      work.data.fill(0, 0, zeroTo);
    }
    return work.data;
  }

  public static permuteInv(
    permutation: number[],
    input: number[],
    output: number[],
    size: number
  ): void {
    for (let index = 0; index < size; index += 1) {
      output[permutation[index]] = input[index];
    }
  }
}
