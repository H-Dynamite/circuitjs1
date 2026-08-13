import { CircuitElm } from "../CircuitElm";
import { ExprParser, ExprState } from "../Expr";
import { Point } from "../Point";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

interface LookupEntry {
  low: number;
  high: number;
  template: string;
}

/** Bus-value text display ported from InstructionDisplayElm.java. */
export class InstructionDisplayElm extends CircuitElm {
  public busWidth = 4;
  public threshold = 2.5;
  public lookupText = "0=text0\n1=text1\n0x2-0xF=other ({a})\n";
  private entries: LookupEntry[] = [];

  public constructor(x: number, y: number) {
    super(x, y);
    this.parseEntries();
  }

  public override getXmlDumpType(): string {
    return "ins";
  }

  public override getPostCount(): number {
    return this.busWidth;
  }

  public override getPostWidth(_index: number): number {
    return this.busWidth;
  }

  public override getPost(index: number): Point {
    return new Point(this.x, this.y, index);
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return false;
  }

  public readInputValue(): number {
    let value = 0;
    for (let bit = 0; bit < this.busWidth; bit += 1) {
      if (this.volts[bit] > this.threshold) value |= 1 << bit;
    }
    return value;
  }

  public getDisplayText(): string {
    const value = this.readInputValue();
    const entry = this.entries.find(
      (candidate) => value >= candidate.low && value <= candidate.high
    );
    if (entry === undefined) return String(value);
    return entry.template.replace(/\{([^{}]+)\}/g, (match, source) => {
      const parser = new ExprParser(source);
      const expression = parser.parseExpression();
      if (parser.gotError() !== null) return match;
      const state = new ExprState(1);
      state.values[0] = value;
      const result = expression.eval(state);
      return Number.isInteger(result) ? String(result) : String(result);
    });
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "bw", this.busWidth);
    if (this.threshold !== 2.5) {
      XMLSerializer.dumpAttr(element, "th", this.threshold);
    }
    element.appendChild(document.createTextNode(this.lookupText));
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.busWidth = xml.parseIntAttr("bw", this.busWidth);
    this.threshold = xml.parseDoubleAttr("th", this.threshold);
    this.lookupText = xml.parseContents() ?? "";
    this.allocNodes();
    this.parseEntries();
  }

  private parseEntries(): void {
    this.entries = [];
    for (const sourceLine of this.lookupText.split(/\r?\n/)) {
      const line = sourceLine.trim();
      const equals = line.indexOf("=");
      if (line.length === 0 || equals < 0) continue;
      const key = line.slice(0, equals).trim();
      const template = line.slice(equals + 1);
      const dash = key.indexOf(
        "-",
        /^0[xb]/i.test(key) ? 2 : 0
      );
      const low = this.parseNumber(
        dash < 0 ? key : key.slice(0, dash)
      );
      const high = this.parseNumber(
        dash < 0 ? key : key.slice(dash + 1)
      );
      if (Number.isFinite(low) && Number.isFinite(high)) {
        this.entries.push({ low, high, template });
      }
    }
  }

  private parseNumber(value: string): number {
    const source = value.trim();
    if (/^0x/i.test(source)) return Number.parseInt(source.slice(2), 16);
    if (/^0b/i.test(source)) return Number.parseInt(source.slice(2), 2);
    return Number.parseInt(source, 10);
  }
}
