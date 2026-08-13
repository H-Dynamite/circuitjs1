/**
 * TypeScript equivalent of java.util.StringTokenizer.
 *
 * Circuit element constructors depend on its character-delimiter semantics,
 * so this intentionally does not use String.split().
 */
export class StringTokenizer {
  private position = 0;

  public constructor(
    private readonly source: string,
    private delimiters = " \t\n\r\f",
    private readonly returnDelimiters = false
  ) {}

  public hasMoreTokens(): boolean {
    return this.findNextPosition(this.position) < this.source.length;
  }

  public nextToken(delimiters?: string): string {
    if (delimiters !== undefined) {
      this.delimiters = delimiters;
    }

    if (!this.returnDelimiters) {
      this.position = this.skipDelimiters(this.position);
    }
    if (this.position >= this.source.length) {
      throw new Error("NoSuchElementException");
    }

    if (
      this.returnDelimiters &&
      this.isDelimiter(this.source[this.position])
    ) {
      const token = this.source[this.position];
      this.position += 1;
      return token;
    }

    const start = this.position;
    while (
      this.position < this.source.length &&
      !this.isDelimiter(this.source[this.position])
    ) {
      this.position += 1;
    }
    return this.source.substring(start, this.position);
  }

  public countTokens(): number {
    let count = 0;
    let cursor = this.position;
    while (cursor < this.source.length) {
      if (!this.returnDelimiters) {
        cursor = this.skipDelimiters(cursor);
      }
      if (cursor >= this.source.length) {
        break;
      }
      count += 1;
      if (this.returnDelimiters && this.isDelimiter(this.source[cursor])) {
        cursor += 1;
      } else {
        while (
          cursor < this.source.length &&
          !this.isDelimiter(this.source[cursor])
        ) {
          cursor += 1;
        }
      }
    }
    return count;
  }

  public toArray(): string[] {
    const result: string[] = [];
    while (this.hasMoreTokens()) {
      result.push(this.nextToken());
    }
    return result;
  }

  private findNextPosition(from: number): number {
    return this.returnDelimiters ? from : this.skipDelimiters(from);
  }

  private skipDelimiters(from: number): number {
    let cursor = from;
    while (
      cursor < this.source.length &&
      this.isDelimiter(this.source[cursor])
    ) {
      cursor += 1;
    }
    return cursor;
  }

  private isDelimiter(character: string): boolean {
    return this.delimiters.includes(character);
  }
}
