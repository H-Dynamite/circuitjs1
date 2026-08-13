import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Photoresistor controlled by a normalized light-position value. */
export class LDRElm extends CircuitElm {
  public position = 0.34;
  public resistance = 0;
  public minLux = 0.1;
  public maxLux = 10000;
  public lux = 0;
  public sliderText = "Light Brightness";

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
      const position = Number(tokenizer.nextToken());
      if (Number.isFinite(position)) this.position = position;
    }
    if (tokenizer.hasMoreTokens()) {
      this.sliderText = CustomLogicModel.unescape(
        tokenizer.nextToken()
      );
    }
    this.updateResistance();
  }

  public override getDumpType(): number {
    return 374;
  }

  public luxFromSliderPos(): number {
    return this.maxLux * this.position + this.minLux;
  }

  public calcResistance(lux: number): number {
    return Math.round((this.maxLux - lux + 1) * 10);
  }

  public updateResistance(): void {
    this.lux = this.luxFromSliderPos();
    this.resistance = Math.max(1e-9, this.calcResistance(this.lux));
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
      `${super.dump()} ${this.position} ` +
      `${CustomLogicModel.escape(this.sliderText)}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ps", this.position);
    XMLSerializer.dumpAttr(element, "st", this.sliderText);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.position = xml.parseDoubleAttr("ps", this.position);
    this.sliderText =
      xml.parseStringAttr("st", this.sliderText) ?? this.sliderText;
    this.updateResistance();
  }
}
