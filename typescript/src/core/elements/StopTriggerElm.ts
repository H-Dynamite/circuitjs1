import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** One-terminal voltage trigger that asks the native UI to pause. */
export class StopTriggerElm extends CircuitElm {
  public triggerVoltage = 1;
  public triggered = false;
  public stopped = false;
  public delay = 0;
  public triggerTime = 0;
  /** 0 means >=; 1 means <=. */
  public type = 0;

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
    const keys = ["triggerVoltage", "type", "delay"] as const;
    for (const key of keys) {
      if (!tokenizer.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this[key] = value;
    }
  }

  public override getDumpType(): number {
    return 408;
  }

  public override getPostCount(): number {
    return 1;
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override reset(): void {
    super.reset();
    this.triggered = false;
    this.stopped = false;
  }

  public override stepFinished(): void {
    this.stopped = false;
    const thresholdReached =
      (this.type === 0 && this.volts[0] >= this.triggerVoltage) ||
      (this.type === 1 && this.volts[0] <= this.triggerVoltage);
    if (!this.triggered && thresholdReached) {
      this.triggered = true;
      this.triggerTime = CircuitElm.sim.t;
    }
    if (
      this.triggered &&
      CircuitElm.sim.t >= this.triggerTime + this.delay
    ) {
      this.triggered = false;
      this.stopped = true;
    }
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.triggerVoltage} ${this.type} ` +
      `${this.delay}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "tv", this.triggerVoltage);
    XMLSerializer.dumpAttr(element, "tp", this.type);
    XMLSerializer.dumpAttr(element, "dl", this.delay);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.triggerVoltage = xml.parseDoubleAttr(
      "tv",
      this.triggerVoltage
    );
    this.type = xml.parseIntAttr("tp", this.type);
    this.delay = xml.parseDoubleAttr("dl", this.delay);
  }
}
