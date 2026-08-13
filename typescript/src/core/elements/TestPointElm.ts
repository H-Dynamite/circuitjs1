import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** One-terminal measurement point with RMS/peak/timing modes. */
export class TestPointElm extends CircuitElm {
  public static readonly TP_VOL = 0;
  public static readonly TP_RMS = 1;
  public static readonly TP_MAX = 2;
  public static readonly TP_MIN = 3;
  public static readonly TP_P2P = 4;
  public static readonly TP_BIN = 5;
  public static readonly TP_FRQ = 6;
  public static readonly TP_PER = 7;
  public static readonly TP_PWI = 8;
  public static readonly TP_DUT = 9;
  public static readonly FLAG_LABEL = 1;

  public meter = TestPointElm.TP_VOL;
  public label = "TP";
  public rmsV = 0;
  public lastMaxV = 0;
  public lastMinV = 0;
  public frequency = 0;
  public period = 0;
  public binaryLevel = 0;
  public pulseWidth = 0;
  public dutyCycle = 0;
  public selectedValue = 0;
  private sampleSquareTotal = 0;
  private sampleCount = 0;
  private cycleMax = Number.NEGATIVE_INFINITY;
  private cycleMin = Number.POSITIVE_INFINITY;
  private lastRisingTime: number | null = null;
  private lastFallingTime: number | null = null;
  private previousVoltage = 0;

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
      this.meter = Number.parseInt(tokenizer.nextToken(), 10) || 0;
    }
    if (
      this.hasFlag(TestPointElm.FLAG_LABEL) &&
      tokenizer.hasMoreTokens()
    ) {
      this.label = CustomLogicModel.unescape(tokenizer.nextToken());
    }
  }

  public override getDumpType(): number {
    return 368;
  }

  public override getPostCount(): number {
    return 1;
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override stepFinished(): void {
    const voltage = this.volts[0];
    const now = CircuitElm.sim.t;
    this.sampleCount += 1;
    this.sampleSquareTotal += voltage * voltage;
    this.cycleMax = Math.max(this.cycleMax, voltage);
    this.cycleMin = Math.min(this.cycleMin, voltage);
    this.binaryLevel = voltage < 2.5 ? 0 : 1;

    const rising =
      this.previousVoltage < 2.5 && voltage >= 2.5;
    const falling =
      this.previousVoltage >= 2.5 && voltage < 2.5;
    if (falling && this.lastRisingTime !== null) {
      this.lastFallingTime = now;
      this.pulseWidth = now - this.lastRisingTime;
    }
    if (rising) {
      if (this.lastRisingTime !== null) {
        this.period = now - this.lastRisingTime;
        this.frequency = this.period > 0 ? 1 / this.period : 0;
        this.dutyCycle =
          this.period > 0 ? this.pulseWidth / this.period : 0;
        this.rmsV = Math.sqrt(
          this.sampleSquareTotal / Math.max(this.sampleCount, 1)
        );
        this.lastMaxV = Number.isFinite(this.cycleMax)
          ? this.cycleMax
          : voltage;
        this.lastMinV = Number.isFinite(this.cycleMin)
          ? this.cycleMin
          : voltage;
      }
      this.lastRisingTime = now;
      this.sampleSquareTotal = 0;
      this.sampleCount = 0;
      this.cycleMax = voltage;
      this.cycleMin = voltage;
    }
    this.previousVoltage = voltage;
    const values = [
      voltage,
      this.rmsV,
      this.lastMaxV,
      this.lastMinV,
      this.lastMaxV - this.lastMinV,
      this.binaryLevel,
      this.frequency,
      this.period,
      this.pulseWidth,
      this.dutyCycle
    ];
    this.selectedValue = values[this.meter] ?? voltage;
  }

  public override dump(): string {
    if (this.label !== "TP") {
      this.flags |= TestPointElm.FLAG_LABEL;
    }
    const label =
      this.hasFlag(TestPointElm.FLAG_LABEL)
        ? ` ${CustomLogicModel.escape(this.label)}`
        : "";
    return `${super.dump()} ${this.meter}${label}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "me", this.meter);
    if (this.label !== "TP") {
      XMLSerializer.dumpAttr(element, "lb", this.label);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.meter = xml.parseIntAttr("me", this.meter);
    this.label = xml.parseStringAttr("lb", "TP") ?? "TP";
  }
}
