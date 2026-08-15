import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

export const AUDIO_OUTPUT_NOT_READY_MESSAGE =
  "Audio data is not ready yet. Increase simulation speed to make data ready sooner.";

const MINIMUM_PLAYBACK_SECONDS = 0.05;

export function encodeAudioOutputWav(samples: Int16Array, samplingRate: number): Uint8Array {
  const result = new Uint8Array(46 + samples.length * 2);
  const view = new DataView(result.buffer);
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) result[offset + index] = value.charCodeAt(index);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, samples.length * 2 + 15, true);
  writeAscii(8, "WAVE"); writeAscii(12, "fmt ");
  view.setUint32(16, 18, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, samplingRate, true); view.setUint32(28, samplingRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint16(36, 0, true);
  writeAscii(38, "data"); view.setUint32(42, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(46 + index * 2, sample, true));
  return result;
}

/** One-terminal simulation audio recorder. */
export class AudioOutputElm extends CircuitElm {
  public duration = 1;
  public samplingRate = 8000;
  public labelNum = 1;
  public data: number[] = [];
  public dataPtr = 0;
  public dataFull = false;
  public sampleStep = 1 / 8000;
  public nextDataSample = 0;
  public dataSample = 0;
  public dataSampleCount = 0;

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
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.duration = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(value)) this.samplingRate = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(value)) this.labelNum = value;
    }
    this.setDataCount();
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 211;
  }

  public override getXmlDumpType(): string {
    return "aout";
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.duration} ${this.samplingRate} ` +
      `${this.labelNum}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "du", this.duration);
    XMLSerializer.dumpAttr(element, "sa", this.samplingRate);
    XMLSerializer.dumpAttr(element, "la", this.labelNum);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.duration = xml.parseDoubleAttr("du", this.duration);
    this.samplingRate = xml.parseIntAttr("sa", this.samplingRate);
    this.labelNum = xml.parseIntAttr("la", this.labelNum);
    this.setDataCount();
  }

  public override getPostCount(): number {
    return 1;
  }

  public override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      this.dn === 0 ? 1 : 1 - 20 / this.dn
    );
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override reset(): void {
    this.dataPtr = 0;
    this.dataFull = false;
    this.dataSampleCount = 0;
    this.nextDataSample = 0;
    this.dataSample = 0;
  }

  public override stepFinished(): void {
    this.dataSample += this.volts[0];
    this.dataSampleCount += 1;
    if (CircuitElm.sim.t < this.nextDataSample) {
      return;
    }
    this.nextDataSample += this.sampleStep;
    this.data[this.dataPtr] =
      this.dataSample / this.dataSampleCount;
    this.dataPtr += 1;
    this.dataSampleCount = 0;
    this.dataSample = 0;
    if (this.dataPtr >= this.data.length) {
      this.dataPtr = 0;
      this.dataFull = true;
    }
  }

  public getRecordedSamples(): number[] {
    if (!this.dataFull) {
      return this.data.slice(0, this.dataPtr);
    }
    return [
      ...this.data.slice(this.dataPtr),
      ...this.data.slice(0, this.dataPtr)
    ];
  }

  public getPlaybackSamples(): Int16Array | null {
    const recorded = this.getRecordedSamples();
    if (recorded.length * this.sampleStep < MINIMUM_PLAYBACK_SECONDS) return null;
    let maximum = -Number.MAX_VALUE;
    let minimum = Number.MAX_VALUE;
    for (const sample of recorded) {
      maximum = Math.max(maximum, sample);
      minimum = Math.min(minimum, sample);
    }
    const adjustment = -(maximum + minimum) / 2;
    const peak = maximum + adjustment;
    if (!(peak > 0)) return new Int16Array(recorded.length);
    const multiplier = (0.25 * 32766) / peak;
    const fadeLength = Math.trunc(this.samplingRate / 20);
    const fadeOut = recorded.length - fadeLength;
    const fadeMultiplier = multiplier / fadeLength;
    return Int16Array.from(recorded, (sample, index) => {
      const fade = index < fadeLength
        ? index * fadeMultiplier
        : index > fadeOut
          ? (recorded.length - index) * fadeMultiplier
          : multiplier;
      return Math.trunc((sample + adjustment) * fade);
    });
  }

  public createWavFile(): Uint8Array | null {
    const samples = this.getPlaybackSamples();
    return samples === null ? null : encodeAudioOutputWav(samples, this.samplingRate);
  }

  private setDataCount(): void {
    const count = Math.max(
      1,
      Math.floor(this.samplingRate * this.duration)
    );
    this.data = Array<number>(count).fill(0);
    this.sampleStep = 1 / this.samplingRate;
    this.nextDataSample = CircuitElm.sim.t + this.sampleStep;
    this.dataPtr = 0;
    this.dataFull = false;
  }
}
