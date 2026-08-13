import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Voltmeter/test point with optional input resistance. */
export class ProbeElm extends CircuitElm {
  public static readonly FLAG_SHOW_VOLTAGE = 1;
  public static readonly FLAG_CIRCLE = 2;
  public static readonly TP_VOL = 0;
  public static readonly TP_RMS = 1;
  public static readonly TP_MAX = 2;
  public static readonly TP_MIN = 3;
  public static readonly TP_P2P = 4;
  public static readonly TP_BIN = 5;

  public meter = ProbeElm.TP_VOL;
  public scale = CircuitElm.SCALE_AUTO;
  public resistance = 0;
  public rmsV = 0;
  public total = 0;
  public count = 0;
  public binaryLevel = 0;
  public maxV = Number.NEGATIVE_INFINITY;
  public minV = Number.POSITIVE_INFINITY;

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
    flags = ProbeElm.FLAG_SHOW_VOLTAGE | ProbeElm.FLAG_CIRCLE,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer === undefined) {
      this.flags =
        ProbeElm.FLAG_SHOW_VOLTAGE | ProbeElm.FLAG_CIRCLE;
      this.resistance = 1e7;
      return;
    }
    if (tokenizer.hasMoreTokens()) {
      const meter = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(meter)) {
        this.meter = meter;
      }
    }
    if (tokenizer.hasMoreTokens()) {
      const scale = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(scale)) {
        this.scale = scale;
      }
    }
    if (tokenizer.hasMoreTokens()) {
      const resistance = Number(tokenizer.nextToken());
      if (Number.isFinite(resistance)) {
        this.resistance = resistance;
      }
    }
  }

  public override getDumpType(): number {
    return "p".charCodeAt(0);
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.meter} ${this.scale} ` +
      `${this.resistance}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "me", this.meter);
    XMLSerializer.dumpAttr(element, "sc", this.scale);
    XMLSerializer.dumpAttr(element, "re", this.resistance);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    this.flags = 0;
    super.undumpXml(xml);
    this.meter = xml.parseIntAttr("me", this.meter);
    this.scale = xml.parseIntAttr("sc", this.scale);
    this.resistance = xml.parseDoubleAttr("re", 0);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(this.drawAsCircle() ? 24 : 16);
  }

  public mustShowVoltage(): boolean {
    return this.hasFlag(ProbeElm.FLAG_SHOW_VOLTAGE);
  }

  public drawAsCircle(): boolean {
    return this.hasFlag(ProbeElm.FLAG_CIRCLE);
  }

  public getMeterLabel(): string {
    return [
      "V",
      "V(rms)",
      "Vmax",
      "Vmin",
      "Peak to peak",
      "Binary"
    ][this.meter] ?? "";
  }

  public getDisplayValue(): string {
    switch (this.meter) {
      case ProbeElm.TP_RMS:
        return CircuitElm.getShortUnitText(this.rmsV, "V(rms)");
      case ProbeElm.TP_MAX:
        return CircuitElm.getShortUnitText(
          Number.isFinite(this.maxV) ? this.maxV : 0,
          "Vpk"
        );
      case ProbeElm.TP_MIN:
        return CircuitElm.getShortUnitText(
          Number.isFinite(this.minV) ? this.minV : 0,
          "Vmin"
        );
      case ProbeElm.TP_P2P:
        return CircuitElm.getShortUnitText(
          Number.isFinite(this.maxV - this.minV)
            ? this.maxV - this.minV
            : 0,
          "Vp2p"
        );
      case ProbeElm.TP_BIN:
        return String(this.binaryLevel);
      default:
        return CircuitElm.getShortUnitText(this.getVoltageDiff(), "V");
    }
  }

  public override stepFinished(): void {
    const voltage = this.getVoltageDiff();
    this.count += 1;
    this.total += voltage * voltage;
    this.rmsV = Math.sqrt(this.total / this.count);
    this.binaryLevel = voltage < 2.5 ? 0 : 1;
    this.maxV = Math.max(this.maxV, voltage);
    this.minV = Math.min(this.minV, voltage);
  }

  public override calculateCurrent(): void {
    this.current =
      this.resistance === 0
        ? 0
        : (this.volts[0] - this.volts[1]) / this.resistance;
  }

  public override stamp(): void {
    if (this.resistance !== 0) {
      CircuitElm.sim.stampResistor(
        this.nodes[0],
        this.nodes[1],
        this.resistance
      );
    }
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return this.resistance !== 0;
  }
}
