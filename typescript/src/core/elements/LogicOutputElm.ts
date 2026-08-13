import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** One-terminal digital indicator, ported from LogicOutputElm.java. */
export class LogicOutputElm extends CircuitElm {
  public static readonly FLAG_TERNARY = 1;
  public static readonly FLAG_NUMERIC = 2;
  public static readonly FLAG_PULLDOWN = 4;

  public threshold = 2.5;
  public value = "L";

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
      const threshold = Number(tokenizer.nextToken());
      if (Number.isFinite(threshold)) {
        this.threshold = threshold;
      }
    }
    this.allocNodes();
  }

  public override getDumpType(): number {
    return "M".charCodeAt(0);
  }

  public override dump(): string {
    return `${super.dump()} ${this.threshold}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    if (this.threshold !== 2.5) {
      XMLSerializer.dumpAttr(element, "th", this.threshold);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.threshold = xml.parseDoubleAttr("th", this.threshold);
  }

  public isTernary(): boolean {
    return this.hasFlag(LogicOutputElm.FLAG_TERNARY);
  }

  public isNumeric(): boolean {
    return (
      this.flags &
      (LogicOutputElm.FLAG_TERNARY | LogicOutputElm.FLAG_NUMERIC)
    ) !== 0;
  }

  public needsPullDown(): boolean {
    return this.hasFlag(LogicOutputElm.FLAG_PULLDOWN);
  }

  public getLogicValue(): string {
    const voltage = this.volts[0] ?? 0;
    if (this.isTernary()) {
      this.value =
        voltage > this.threshold * 1.5
          ? "2"
          : voltage > this.threshold * 0.5
            ? "1"
            : "0";
    } else if (this.isNumeric()) {
      this.value = voltage < this.threshold ? "0" : "1";
    } else {
      this.value = voltage < this.threshold ? "L" : "H";
    }
    return this.value;
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

  public override stamp(): void {
    if (this.needsPullDown()) {
      CircuitElm.sim.stampResistor(
        this.nodes[0],
        CircuitNode.ground,
        1e6
      );
    }
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }
}
