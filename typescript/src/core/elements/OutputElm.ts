import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** One-terminal output marker, ported from OutputElm.java. */
export class OutputElm extends CircuitElm {
  public static readonly FLAG_VALUE = 1;
  public static readonly FLAG_FIXED = 2;

  public scale = CircuitElm.SCALE_AUTO;

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
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      const scale = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(scale)) {
        this.scale = scale;
      }
    }
    this.allocNodes();
  }

  public override getDumpType(): number {
    return "O".charCodeAt(0);
  }

  public override dump(): string {
    return `${super.dump()} ${this.scale}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "sc", this.scale);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.scale = xml.parseIntAttr("sc", this.scale);
  }

  public override getPostCount(): number {
    return 1;
  }

  public override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      this.dn === 0 ? 1 : 1 - 12 / this.dn
    );
  }

  public showVoltage(): boolean {
    return this.hasFlag(OutputElm.FLAG_VALUE);
  }

  public isFixed(): boolean {
    return this.hasFlag(OutputElm.FLAG_FIXED);
  }

  public getDisplayValue(): string {
    return this.showVoltage()
      ? CircuitElm.getShortUnitText(this.volts[0] ?? 0, "V")
      : "out";
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }
}
