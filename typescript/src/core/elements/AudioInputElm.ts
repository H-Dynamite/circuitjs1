import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

/** Decoded mono-audio waveform used as a voltage rail. */
export class AudioInputElm extends RailElm {
  public data: number[] = [];
  public timeOffset = 0;
  public samplingRate = 44100;
  public fileName = "No file";
  public audioMaxVoltage = 5;
  public startPosition = 0;

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
      const maximum = Number(tokenizer.nextToken());
      if (Number.isFinite(maximum)) this.audioMaxVoltage = maximum;
    }
    if (tokenizer?.hasMoreTokens()) {
      const start = Number(tokenizer.nextToken());
      if (Number.isFinite(start)) this.startPosition = start;
    }
    if (tokenizer?.hasMoreTokens()) tokenizer.nextToken();
  }

  public override getDumpType(): number {
    return 411;
  }

  public override getXmlDumpType(): string {
    return "ain";
  }

  public loadAudioData(
    samples: Float32Array | number[],
    samplingRate: number,
    fileName = "audio"
  ): void {
    this.data = Array.from(samples);
    this.samplingRate = samplingRate;
    this.fileName = fileName.replace(/\.[^.]*$/, "") || "audio";
    this.reset();
  }

  public override reset(): void {
    super.reset();
    this.timeOffset = this.startPosition;
  }

  public override getVoltage(): number {
    if (this.data.length === 0) return 0;
    this.timeOffset = Math.max(this.timeOffset, this.startPosition);
    const pointer = this.timeOffset * this.samplingRate;
    const index = Math.floor(pointer);
    if (index >= this.data.length) return 0;
    const fraction = pointer - index;
    const first = this.data[index];
    const second = this.data[index + 1] ?? 0;
    return (
      (first * (1 - fraction) + second * fraction) *
      this.audioMaxVoltage
    );
  }

  public override stepFinished(): void {
    this.timeOffset += CircuitElm.sim.timeStep;
  }

  public override getRailText(): string {
    return this.fileName;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.audioMaxVoltage} ` +
      `${this.startPosition} 0`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ma", this.audioMaxVoltage);
    XMLSerializer.dumpAttr(element, "st", this.startPosition);
    XMLSerializer.dumpAttr(element, "sr", this.samplingRate);
    XMLSerializer.dumpAttr(element, "name", this.fileName);
    if (this.data.length > 0) {
      element.append(document.createTextNode(this.data.join(",")));
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    const contents = xml.parseContents();
    super.undumpXml(xml);
    this.audioMaxVoltage = xml.parseDoubleAttr(
      "ma",
      this.audioMaxVoltage
    );
    this.startPosition = xml.parseDoubleAttr("st", this.startPosition);
    this.samplingRate = xml.parseIntAttr("sr", this.samplingRate);
    this.fileName =
      xml.parseStringAttr("name", this.fileName) ?? this.fileName;
    if (contents !== null && contents.trim().length > 0) {
      this.data = contents
        .split(",")
        .map(Number)
        .filter(Number.isFinite);
    }
  }
}
