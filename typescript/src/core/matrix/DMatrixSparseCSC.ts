export interface CoordinateRealValue {
  row: number;
  col: number;
  value: number;
}

/**
 * Compressed sparse column matrix ported from matrix/DMatrixSparseCSC.java.
 * Public field names intentionally preserve the Java/EJML layout.
 */
export class DMatrixSparseCSC implements Iterable<CoordinateRealValue> {
  public static readonly EPS = 2 ** -52;

  public nz_values: number[] = [];
  public nz_length = 0;
  public nz_rows: number[] = [];
  public col_idx: number[];
  public numRows: number;
  public numCols: number;
  public indicesSorted = false;

  public constructor(original: DMatrixSparseCSC);
  public constructor(numRows: number, numCols: number, arrayLength?: number);
  public constructor(
    rowsOrOriginal: number | DMatrixSparseCSC,
    numCols = 0,
    arrayLength = 0
  ) {
    if (rowsOrOriginal instanceof DMatrixSparseCSC) {
      this.numRows = rowsOrOriginal.numRows;
      this.numCols = rowsOrOriginal.numCols;
      this.col_idx = Array<number>(this.numCols + 1).fill(0);
      this.growMaxLength(rowsOrOriginal.nz_length, false);
      this.setTo(rowsOrOriginal);
      return;
    }

    if (rowsOrOriginal < 0 || numCols < 0 || arrayLength < 0) {
      throw new RangeError(
        "Rows, columns, and arrayLength must not be negative"
      );
    }
    this.numRows = rowsOrOriginal;
    this.numCols = numCols;
    this.col_idx = Array<number>(numCols + 1).fill(0);
    this.growMaxLength(arrayLength, false);
  }

  public getNumRows(): number {
    return this.numRows;
  }

  public getNumCols(): number {
    return this.numCols;
  }

  public copy(): DMatrixSparseCSC {
    return new DMatrixSparseCSC(this);
  }

  public createLike(): DMatrixSparseCSC {
    return new DMatrixSparseCSC(this.numRows, this.numCols);
  }

  public setTo(original: DMatrixSparseCSC): void {
    this.reshape(original.numRows, original.numCols, original.nz_length);
    this.nz_length = original.nz_length;
    this.nz_values.splice(
      0,
      original.nz_length,
      ...original.nz_values.slice(0, original.nz_length)
    );
    this.nz_rows.splice(
      0,
      original.nz_length,
      ...original.nz_rows.slice(0, original.nz_length)
    );
    this.col_idx.splice(
      0,
      original.numCols + 1,
      ...original.col_idx.slice(0, original.numCols + 1)
    );
    this.indicesSorted = original.indicesSorted;
  }

  public isAssigned(row: number, column: number): boolean {
    return this.nz_index(row, column) >= 0;
  }

  public get(row: number, column: number, fallbackValue = 0): number {
    this.checkBounds(row, column);
    return this.unsafe_get(row, column, fallbackValue);
  }

  public unsafe_get(row: number, column: number, fallbackValue = 0): number {
    const index = this.nz_index(row, column);
    return index >= 0 ? this.nz_values[index] : fallbackValue;
  }

  public nz_index(row: number, column: number): number {
    const start = this.col_idx[column];
    const end = this.col_idx[column + 1];
    if (this.indicesSorted) {
      let low = start;
      let high = end - 1;
      while (low <= high) {
        const middle = (low + high) >>> 1;
        const value = this.nz_rows[middle];
        if (value < row) {
          low = middle + 1;
        } else if (value > row) {
          high = middle - 1;
        } else {
          return middle;
        }
      }
      return -(low + 1);
    }

    for (let index = start; index < end; index += 1) {
      if (this.nz_rows[index] === row) {
        return index;
      }
    }
    return -1;
  }

  public set(row: number, column: number, value: number): void {
    this.checkBounds(row, column);
    this.unsafe_set(row, column, value);
  }

  public unsafe_set(row: number, column: number, value: number): void {
    let index = this.nz_index(row, column);
    if (index >= 0) {
      this.nz_values[index] = value;
      return;
    }

    const start = this.col_idx[column];
    const end = this.col_idx[column + 1];
    for (index = start; index < end; index += 1) {
      if (row < this.nz_rows[index]) {
        break;
      }
    }

    for (let current = column + 1; current <= this.numCols; current += 1) {
      this.col_idx[current] += 1;
    }
    if (this.nz_length >= this.nz_values.length) {
      this.growMaxLength(this.nz_length * 2 + 1, true);
    }

    for (let current = this.nz_length; current > index; current -= 1) {
      this.nz_rows[current] = this.nz_rows[current - 1];
      this.nz_values[current] = this.nz_values[current - 1];
    }
    this.nz_rows[index] = row;
    this.nz_values[index] = value;
    this.nz_length += 1;
  }

  public remove(row: number, column: number): void {
    const index = this.nz_index(row, column);
    if (index < 0) {
      return;
    }

    for (let current = column + 1; current <= this.numCols; current += 1) {
      this.col_idx[current] -= 1;
    }
    this.nz_length -= 1;
    for (let current = index; current < this.nz_length; current += 1) {
      this.nz_rows[current] = this.nz_rows[current + 1];
      this.nz_values[current] = this.nz_values[current + 1];
    }
  }

  public zero(): void {
    this.col_idx.fill(0, 0, this.numCols + 1);
    this.nz_length = 0;
    this.indicesSorted = false;
  }

  public create(numRows: number, numCols: number): DMatrixSparseCSC {
    return new DMatrixSparseCSC(numRows, numCols);
  }

  public getNonZeroLength(): number {
    return this.nz_length;
  }

  public reshape(
    numRows: number,
    numCols: number,
    arrayLength = 0
  ): void {
    if (numRows < 0 || numCols < 0 || arrayLength < 0) {
      throw new RangeError(
        "Rows, columns, and arrayLength must not be negative"
      );
    }

    this.indicesSorted = false;
    this.numRows = numRows;
    this.numCols = numCols;
    this.growMaxLength(arrayLength, false);
    this.nz_length = 0;
    if (numCols + 1 > this.col_idx.length) {
      this.col_idx = Array<number>(numCols + 1).fill(0);
    } else {
      this.col_idx.fill(0, 0, numCols + 1);
    }
  }

  public shrinkArrays(): void {
    if (this.nz_length < this.nz_values.length) {
      this.nz_values = this.nz_values.slice(0, this.nz_length);
      this.nz_rows = this.nz_rows.slice(0, this.nz_length);
    }
  }

  public growMaxLength(
    arrayLength: number,
    preserveValue: boolean
  ): void {
    if (arrayLength < 0) {
      throw new RangeError("Negative array length. Overflow?");
    }
    if (arrayLength <= this.nz_values.length) {
      return;
    }

    const values = Array<number>(arrayLength).fill(0);
    const rows = Array<number>(arrayLength).fill(0);
    if (preserveValue) {
      for (let index = 0; index < this.nz_length; index += 1) {
        values[index] = this.nz_values[index];
        rows[index] = this.nz_rows[index];
      }
    }
    this.nz_values = values;
    this.nz_rows = rows;
  }

  public growMaxColumns(
    desiredColumns: number,
    preserveValue: boolean
  ): void {
    if (this.col_idx.length >= desiredColumns + 1) {
      return;
    }
    const columns = Array<number>(desiredColumns + 1).fill(0);
    if (preserveValue) {
      for (let index = 0; index < this.col_idx.length; index += 1) {
        columns[index] = this.col_idx[index];
      }
    }
    this.col_idx = columns;
  }

  public histogramToStructure(histogram: number[]): void {
    this.col_idx[0] = 0;
    let index = 0;
    for (let column = 1; column <= this.numCols; column += 1) {
      index += histogram[column - 1];
      this.col_idx[column] = index;
    }
    this.nz_length = index;
    this.growMaxLength(this.nz_length, false);
    if (this.col_idx[this.numCols] !== this.nz_length) {
      throw new Error("Invalid sparse matrix histogram");
    }
  }

  public copyStructure(original: DMatrixSparseCSC): void {
    this.reshape(original.numRows, original.numCols, original.nz_length);
    this.nz_length = original.nz_length;
    for (let index = 0; index <= original.numCols; index += 1) {
      this.col_idx[index] = original.col_idx[index];
    }
    for (let index = 0; index < original.nz_length; index += 1) {
      this.nz_rows[index] = original.nz_rows[index];
    }
  }

  public isIndicesSorted(): boolean {
    return this.indicesSorted;
  }

  public isFull(): boolean {
    return this.nz_length === this.numRows * this.numCols;
  }

  public static convert(
    circuitMatrix: number[][],
    tolerance: number
  ): DMatrixSparseCSC {
    let nonzero = 0;
    for (const row of circuitMatrix) {
      for (const value of row) {
        if (value !== 0) {
          nonzero += 1;
        }
      }
    }

    const destination = new DMatrixSparseCSC(
      circuitMatrix.length,
      circuitMatrix.length,
      nonzero
    );
    destination.col_idx[0] = 0;
    for (let column = 0; column < circuitMatrix.length; column += 1) {
      for (let row = 0; row < circuitMatrix.length; row += 1) {
        const value = circuitMatrix[row][column];
        if (Math.abs(value) > tolerance) {
          destination.nz_rows[destination.nz_length] = row;
          destination.nz_values[destination.nz_length] = value;
          destination.nz_length += 1;
        }
      }
      destination.col_idx[column + 1] = destination.nz_length;
    }
    destination.indicesSorted = true;
    return destination;
  }

  public *createCoordinateIterator(): IterableIterator<CoordinateRealValue> {
    let column = 0;
    for (let index = 0; index < this.nz_length; index += 1) {
      while (
        column + 1 <= this.numCols &&
        index >= this.col_idx[column + 1]
      ) {
        column += 1;
      }
      yield {
        row: this.nz_rows[index],
        col: column,
        value: this.nz_values[index]
      };
    }
  }

  public [Symbol.iterator](): IterableIterator<CoordinateRealValue> {
    return this.createCoordinateIterator();
  }

  private checkBounds(row: number, column: number): void {
    if (
      row < 0 ||
      row >= this.numRows ||
      column < 0 ||
      column >= this.numCols
    ) {
      throw new RangeError("Outside of matrix bounds");
    }
  }
}
