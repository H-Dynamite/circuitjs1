import { AMElm } from "./AMElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { CircuitElm } from "../CircuitElm";

export class FMElm extends AMElm {
  public deviation = 200;
  public lastTime = 0;
  public funcx = 0;

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
      tokenizer === undefined
        ? new StringTokenizer("800 40 5")
        : tokenizer
    );
    if (tokenizer?.hasMoreTokens()) {
      this.deviation = Number(tokenizer.nextToken());
    }
  }

  public override getDumpType(): number {
    return 201;
  }

  public override reset(): void {
    super.reset();
    this.lastTime = 0;
    this.funcx = 0;
  }

  public override getVoltage(): number {
    const deltaTime = CircuitElm.sim.t - this.lastTime;
    this.lastTime = CircuitElm.sim.t;
    const signalAmplitude = Math.sin(
      2 *
        Math.PI *
        (CircuitElm.sim.t - this.freqTimeZero) *
        this.signalFrequency
    );
    this.funcx +=
      deltaTime *
      (this.carrierFrequency + signalAmplitude * this.deviation);
    return Math.sin(2 * Math.PI * this.funcx) * this.maxVoltage;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "dv", this.deviation);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.deviation = xml.parseDoubleAttr("dv", this.deviation);
    this.reset();
  }
}
