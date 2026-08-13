import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Ideal series ammeter with current/RMS tracking. */
export class AmmeterElm extends CircuitElm {
  public static readonly AM_CURRENT = 0;
  public static readonly AM_RMS = 1;
  public meter = AmmeterElm.AM_CURRENT;
  public scale = CircuitElm.SCALE_AUTO;
  public rmsCurrent = 0;
  public total = 0;
  public sampleCount = 0;

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
    flags = 3,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      this.meter = Number.parseInt(tokenizer.nextToken(), 10) || 0;
    }
    if (tokenizer?.hasMoreTokens()) {
      this.scale = Number.parseInt(tokenizer.nextToken(), 10) || 0;
    }
  }

  public override getDumpType(): number {
    return 370;
  }

  public override dump(): string {
    return `${super.dump()} ${this.meter} ${this.scale}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "me", this.meter);
    XMLSerializer.dumpAttr(element, "sc", this.scale);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.meter = xml.parseIntAttr("me", this.meter);
    this.scale = xml.parseIntAttr("sc", this.scale);
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override setVoltageSource(
    _index: number,
    source: VoltageSource
  ): void {
    this.voltSource = source;
    source.setNodes(this.nodes[0], this.nodes[1]);
  }

  public override stamp(): void {
    if (this.voltSource === null) {
      throw new Error("Ammeter voltage source is unassigned");
    }
    CircuitElm.sim.stampVoltageSource(
      this.nodes[0],
      this.nodes[1],
      this.voltSource,
      0
    );
  }

  public override stepFinished(): void {
    this.total += this.current * this.current;
    this.sampleCount += 1;
    this.rmsCurrent = Math.sqrt(this.total / this.sampleCount);
    if (!Number.isFinite(this.rmsCurrent)) this.rmsCurrent = 0;
    if (this.sampleCount > 4096) {
      this.total = this.rmsCurrent * this.rmsCurrent;
      this.sampleCount = 1;
    }
  }

  public override getPower(): number {
    return 0;
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override isWireEquivalent(): boolean {
    return true;
  }
}
