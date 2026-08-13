/** Direct TypeScript port of matrix/DGrowArray.java. */
export class DGrowArray {
  public data: number[];
  public length: number;

  public constructor(length = 0) {
    this.data = Array<number>(length).fill(0);
    this.length = length;
  }

  public reset(): void {
    this.reshape(0);
  }

  public reshape(length: number): DGrowArray {
    if (this.data.length < length) {
      this.data = Array<number>(length).fill(0);
    }
    this.length = length;
    return this;
  }

  public growInternal(amount: number): void {
    this.data.push(...Array<number>(amount).fill(0));
  }

  public setTo(original: DGrowArray): void {
    this.reshape(original.length);
    for (let index = 0; index < original.length; index += 1) {
      this.data[index] = original.data[index];
    }
  }

  public add(value: number): void {
    if (this.length >= this.data.length) {
      this.growInternal(Math.min(500_000, this.data.length + 10));
    }
    this.data[this.length] = value;
    this.length += 1;
  }

  public get(index: number): number {
    this.checkIndex(index);
    return this.data[index];
  }

  public set(index: number, value: number): void {
    this.checkIndex(index);
    this.data[index] = value;
  }

  public free(): void {
    this.data = [];
    this.length = 0;
  }

  private checkIndex(index: number): void {
    if (index < 0 || index >= this.length) {
      throw new RangeError("Out of bounds");
    }
  }
}
