import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { CapacitorElm } from "./CapacitorElm";

/** Polarized capacitor with reverse-voltage metadata. */
export class PolarCapacitorElm extends CapacitorElm {
  public maxNegativeVoltage = 1;

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
      tokenizer ?? new StringTokenizer("0.00001 0.001")
    );
    if (tokenizer?.hasMoreTokens()) {
      const maximum = Number(tokenizer.nextToken());
      if (Number.isFinite(maximum)) this.maxNegativeVoltage = maximum;
    }
  }

  public override getDumpType(): number {
    return 209;
  }

  public override getXmlDumpType(): string {
    return "pc";
  }

  public override dump(): string {
    return `${super.dump()} ${this.maxNegativeVoltage}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "mv", this.maxNegativeVoltage);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.maxNegativeVoltage = xml.parseDoubleAttr(
      "mv",
      this.maxNegativeVoltage
    );
  }
}
