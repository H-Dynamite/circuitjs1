/** Direct TypeScript port of matrix/IGrowArray.java. */
export class IGrowArray {
  public data: number[];
  public length: number;

  public constructor(length = 0) {
    this.data = Array<number>(length).fill(0);
    this.length = length;
  }

  public reshape(length: number): IGrowArray {
    if (this.data.length < length) {
      this.data = Array<number>(length).fill(0);
    }
    this.length = length;
    return this;
  }

  public growInternal(amount: number): void {
    this.data.push(...Array<number>(amount).fill(0));
  }

  public setTo(original: IGrowArray): void {
    this.reshape(original.length);
    for (let index = 0; index < original.length; index += 1) {
      this.data[index] = original.data[index];
    }
  }

  public get(index: number): number {
    this.checkIndex(index);
    return this.data[index];
  }

  public set(index: number, value: number): void {
    this.checkIndex(index);
    this.data[index] = value;
  }

  public add(value: number): void {
    if (this.length === this.data.length) {
      this.growInternal(Math.min(10_000, 1 + this.data.length));
    }
    this.data[this.length] = value;
    this.length += 1;
  }

  public clear(): void {
    this.length = 0;
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
