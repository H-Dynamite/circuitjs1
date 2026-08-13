import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Ring-buffer voltage recorder with text export. */
export class DataRecorderElm extends CircuitElm {
  public dataCount = 10240;
  public dataPointer = 0;
  public data: number[] = Array(this.dataCount).fill(0);
  public dataFull = false;

  public constructor(x: number, y: number);
  public constructor(
    x: number,
    y: number,
    x2: number,
    y2: number,
    flags: number,
    tokenizer: StringTokenizer
  );
  public constructor(
    x: number,
    y: number,
    x2 = x,
    y2 = y,
    flags = 0,
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer.hasMoreTokens()) {
      this.setDataCount(
        Number.parseInt(tokenizer.nextToken(), 10) || this.dataCount
      );
    }
  }

  public override getDumpType(): number {
    return 210;
  }

  public override getPostCount(): number {
    return 1;
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public setDataCount(count: number): void {
    this.dataCount = Math.max(1, Math.floor(count));
    this.data = Array(this.dataCount).fill(0);
    this.dataPointer = 0;
    this.dataFull = false;
  }

  public override reset(): void {
    super.reset();
    this.dataPointer = 0;
    this.dataFull = false;
  }

  public override stepFinished(): void {
    this.data[this.dataPointer] = this.volts[0];
    this.dataPointer += 1;
    if (this.dataPointer >= this.dataCount) {
      this.dataPointer = 0;
      this.dataFull = true;
    }
  }

  public exportData(): string {
    const samples = this.dataFull
      ? Array.from(
          { length: this.dataCount },
          (_, index) =>
            this.data[(this.dataPointer + index) % this.dataCount]
        )
      : this.data.slice(0, this.dataPointer);
    return (
      `# time step = ${CircuitElm.sim.timeStep} sec\n` +
      samples.join("\n")
    );
  }

  public override dump(): string {
    return `${super.dump()} ${this.dataCount}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "dc", this.dataCount);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.setDataCount(xml.parseIntAttr("dc", this.dataCount));
  }
}
