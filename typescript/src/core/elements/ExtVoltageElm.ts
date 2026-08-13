import { CustomLogicModel } from "../CustomLogicModel";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { RailElm } from "./RailElm";
import { VoltageElm } from "./VoltageElm";

/** Named voltage input used by embedders and external-control integrations. */
export class ExtVoltageElm extends RailElm {
  public name: string;
  public voltage: number;

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
    x2 = VoltageElm.WF_AC,
    y2?: number,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    const tokens = tokenizer ?? new StringTokenizer("");
    if (y2 === undefined) {
      super(x, y, VoltageElm.WF_AC);
    } else {
      super(x, y, x2, y2, flags, tokens);
    }
    this.name = "ext";
    this.voltage = 0;
    if (y2 !== undefined && tokens.hasMoreTokens()) {
      this.name = CustomLogicModel.unescape(tokens.nextToken());
    }
    this.waveform = VoltageElm.WF_AC;
  }

  public override getDumpType(): number {
    return 418;
  }

  public override dump(): string {
    return `${super.dump()} ${CustomLogicModel.escape(this.name)}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "nm", this.name);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.name = xml.parseStringAttr("nm", this.name) ?? this.name;
  }

  public setVoltage(voltage: number): void {
    if (Number.isFinite(voltage)) this.voltage = voltage;
  }

  public getName(): string {
    return this.name;
  }

  public override getVoltage(): number {
    return this.voltage;
  }

  public override getRailText(): string {
    return this.name;
  }
}
