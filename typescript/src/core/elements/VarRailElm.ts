import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

/** User-adjustable one-terminal rail. */
export class VarRailElm extends RailElm {
  public sliderText = "Voltage";
  public sliderValue = 100;

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
    this.waveform = VoltageElm.WF_VAR;
    if (tokenizer === undefined) {
      this.frequency = this.maxVoltage;
    } else if (tokenizer.hasMoreTokens()) {
      this.sliderText = tokenizer.toArray().join(" ").replace(/%2[bB]/g, "+");
    }
    this.sliderValue = this.voltageToSlider(this.frequency);
  }

  public override getDumpType(): number {
    return 172;
  }

  public override dump(): string {
    return `${super.dump()} ${this.sliderText}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "st", this.sliderText);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.sliderText =
      xml.parseStringAttr("st", this.sliderText) ?? this.sliderText;
    this.sliderValue = this.voltageToSlider(this.frequency);
  }

  public override getVoltage(): number {
    this.frequency =
      this.bias +
      (this.sliderValue / 100) * (this.maxVoltage - this.bias);
    return this.frequency;
  }

  public setSliderValue(value: number): void {
    this.sliderValue = Math.max(0, Math.min(100, value));
  }

  private voltageToSlider(voltage: number): number {
    const range = this.maxVoltage - this.bias;
    return range === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            100,
            Math.trunc(((voltage - this.bias) * 100) / range)
          )
        );
  }
}
