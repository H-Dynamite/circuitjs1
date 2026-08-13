import { DiodeModel } from "../DiodeModel";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { DiodeElm } from "./DiodeElm";

/** Light-emitting diode model and color state. */
export class LEDElm extends DiodeElm {
  public colorR = 1;
  public colorG = 0;
  public colorB = 0;
  public maxBrightnessCurrent = 0.01;
  public ledLead1 = new Point();
  public ledLead2 = new Point();
  public ledCenter = new Point();

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
    flags = DiodeElm.FLAG_MODEL,
    tokenizer?: StringTokenizer
  ) {
    super(
      x,
      y,
      x2,
      y2,
      flags,
      tokenizer ?? new StringTokenizer("default-led")
    );
    if (
      tokenizer !== undefined &&
      (flags & (DiodeElm.FLAG_MODEL | DiodeElm.FLAG_FWDROP)) === 0
    ) {
      this.model = DiodeModel.getModelWithParameters(2.1024259, 0);
      this.modelName = this.model.name;
      this.setup();
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.colorR = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.colorG = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.colorB = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.maxBrightnessCurrent = value;
    }
  }

  public override getDumpType(): number {
    return 162;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.colorR} ${this.colorG} ${this.colorB} ` +
      `${this.maxBrightnessCurrent}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "cr", this.colorR);
    XMLSerializer.dumpAttr(element, "cg", this.colorG);
    XMLSerializer.dumpAttr(element, "cb", this.colorB);
    XMLSerializer.dumpAttr(
      element,
      "mbc",
      this.maxBrightnessCurrent
    );
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.colorR = xml.parseDoubleAttr("cr", this.colorR);
    this.colorG = xml.parseDoubleAttr("cg", this.colorG);
    this.colorB = xml.parseDoubleAttr("cb", this.colorB);
    this.maxBrightnessCurrent = xml.parseDoubleAttr(
      "mbc",
      this.maxBrightnessCurrent
    );
  }

  public override setPoints(): void {
    super.setPoints();
    const denominator = Math.max(this.dn, 1);
    this.ledLead1 = this.interpPoint(
      this.point1,
      this.point2,
      0.5 - 12 / denominator
    );
    this.ledLead2 = this.interpPoint(
      this.point1,
      this.point2,
      0.5 + 12 / denominator
    );
    this.ledCenter = this.interpPoint(
      this.point1,
      this.point2,
      0.5
    );
  }

  public getBrightness(): number {
    if (this.maxBrightnessCurrent <= 0 || this.current <= 0) {
      return 0;
    }
    return Math.max(
      0,
      Math.min(
        1,
        (1 + 0.2 * Math.log(this.current / this.maxBrightnessCurrent))
      )
    );
  }
}
