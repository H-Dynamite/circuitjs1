import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Beta-equation NTC thermistor controlled by temperature position. */
export class ThermistorNTCElm extends CircuitElm {
  public readonly t0 = 273.15;
  public readonly t25 = this.t0 + 25;
  public position = 0.34;
  public resistance = 10000;
  public minTempr = -40;
  public maxTempr = 150;
  public temperature = 25;
  public r25 = 10000;
  public r50 = 3605;
  public b25100 = 3932;
  public sliderText = "Temperature";

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
    const keys = [
      "r25",
      "r50",
      "minTempr",
      "maxTempr",
      "position"
    ] as const;
    for (const key of keys) {
      if (!tokenizer.hasMoreTokens()) break;
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this[key] = value;
    }
    if (tokenizer.hasMoreTokens()) {
      this.sliderText = CustomLogicModel.unescape(
        tokenizer.nextToken()
      );
    }
    this.updateResistance();
  }

  public override getDumpType(): number {
    return 350;
  }

  public calcB25100(): number {
    const kelvin25 = this.t0 + 25;
    const kelvin50 = this.t0 + 50;
    return (
      (Math.log(this.r25) - Math.log(this.r50)) /
      (1 / kelvin25 - 1 / kelvin50)
    );
  }

  public temprFromSliderPos(): number {
    return Math.round(
      this.position * (this.maxTempr - this.minTempr) +
        this.minTempr
    );
  }

  public calcResistance(temperature: number): number {
    return Math.round(
      this.r25 *
        Math.exp(
          this.b25100 *
            (1 / (temperature + this.t0) - 1 / this.t25)
        )
    );
  }

  public updateResistance(): void {
    this.b25100 = this.calcB25100();
    this.temperature = this.temprFromSliderPos();
    this.resistance = Math.max(
      1e-9,
      this.calcResistance(this.temperature)
    );
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
  }

  public override stamp(): void {
    this.updateResistance();
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.resistance
    );
  }

  public override calculateCurrent(): void {
    this.current =
      (this.volts[0] - this.volts[1]) / this.resistance;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.r25} ${this.r50} ${this.minTempr} ` +
      `${this.maxTempr} ${this.position} ` +
      `${CustomLogicModel.escape(this.sliderText)}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "r25", this.r25);
    XMLSerializer.dumpAttr(element, "r50", this.r50);
    XMLSerializer.dumpAttr(element, "mnt", this.minTempr);
    XMLSerializer.dumpAttr(element, "mxt", this.maxTempr);
    XMLSerializer.dumpAttr(element, "ps", this.position);
    XMLSerializer.dumpAttr(element, "st", this.sliderText);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.r25 = xml.parseDoubleAttr("r25", this.r25);
    this.r50 = xml.parseDoubleAttr("r50", this.r50);
    this.minTempr = xml.parseDoubleAttr("mnt", this.minTempr);
    this.maxTempr = xml.parseDoubleAttr("mxt", this.maxTempr);
    this.position = xml.parseDoubleAttr("ps", this.position);
    this.sliderText =
      xml.parseStringAttr("st", this.sliderText) ?? this.sliderText;
    this.updateResistance();
  }
}
