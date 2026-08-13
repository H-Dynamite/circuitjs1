import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

/** File-backed sampled voltage rail. */
export class DataInputElm extends RailElm {
  public static readonly FLAG_REPEAT = 1 << 8;
  public data: number[] = [];
  public sampleLength = 1e-3;
  public scaleFactor = 1;
  public timeOffset = 0;
  public fileName = "No file";

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
    tokenizer?: StringTokenizer
  ) {
    super(
      x,
      y,
      x2,
      y2,
      flags,
      tokenizer ?? new StringTokenizer("")
    );
    this.waveform = VoltageElm.WF_AC;
    if (tokenizer?.hasMoreTokens()) {
      const sampleLength = Number(tokenizer.nextToken());
      if (Number.isFinite(sampleLength)) {
        this.sampleLength = sampleLength;
      }
    }
    if (tokenizer?.hasMoreTokens()) {
      const scaleFactor = Number(tokenizer.nextToken());
      if (Number.isFinite(scaleFactor)) this.scaleFactor = scaleFactor;
    }
    // Old files contain a cache number after scaleFactor. It is accepted
    // for text-format compatibility, but samples are now persisted in XML.
    if (tokenizer?.hasMoreTokens()) tokenizer.nextToken();
  }

  public override getDumpType(): number {
    return 424;
  }

  public doesRepeat(): boolean {
    return this.hasFlag(DataInputElm.FLAG_REPEAT);
  }

  public loadData(source: string, fileName = "data"): void {
    this.data = source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map(Number)
      .filter(Number.isFinite);
    this.fileName = fileName.replace(/\.[^.]*$/, "") || "data";
    this.timeOffset = 0;
  }

  public override getVoltage(): number {
    if (this.data.length === 0) return 0;
    let index = Math.floor(
      this.timeOffset / Math.max(this.sampleLength, 1e-15)
    );
    if (index >= this.data.length) {
      if (this.doesRepeat()) {
        index %= this.data.length;
        this.timeOffset =
          index * Math.max(this.sampleLength, 1e-15);
      } else {
        index = this.data.length - 1;
      }
    }
    return this.data[index] * this.scaleFactor;
  }

  public override reset(): void {
    super.reset();
    this.timeOffset = 0;
  }

  public override stepFinished(): void {
    this.timeOffset += CircuitElm.sim.timeStep;
  }

  public override getRailText(): string {
    return this.fileName;
  }

  public override dump(): string {
    return `${super.dump()} ${this.sampleLength} ${this.scaleFactor} 0`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "sl", this.sampleLength);
    XMLSerializer.dumpAttr(element, "sf", this.scaleFactor);
    XMLSerializer.dumpAttr(element, "name", this.fileName);
    if (this.data.length > 0) {
      element.append(
        document.createTextNode(this.data.join("\n"))
      );
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    const contents = xml.parseContents();
    super.undumpXml(xml);
    this.sampleLength = xml.parseDoubleAttr("sl", this.sampleLength);
    this.scaleFactor = xml.parseDoubleAttr("sf", this.scaleFactor);
    this.fileName =
      xml.parseStringAttr("name", this.fileName) ?? this.fileName;
    if (contents !== null) this.loadData(contents, this.fileName);
  }
}
