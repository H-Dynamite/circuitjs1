import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Non-electrical circuit annotation, ported from TextElm.java. */
export class TextElm extends CircuitElm {
  public static readonly FLAG_BAR = 2;
  public static readonly FLAG_ESCAPE = 4;

  public text = "hello";
  public lines: string[] = ["hello"];
  public size = 24;

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
    x2 = x + 16,
    y2 = y,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      const size = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(size)) {
        this.size = size;
      }
    }
    if (tokenizer?.hasMoreTokens()) {
      const first = tokenizer.nextToken();
      if (this.hasFlag(TextElm.FLAG_ESCAPE)) {
        this.text = CustomLogicModel.unescape(first);
      } else {
        const parts = [first, ...tokenizer.toArray()];
        this.text = parts.join(" ").replace(/%2[bB]/g, "+");
      }
    }
    this.split();
    this.allocNodes();
  }

  public override getDumpType(): number {
    return "x".charCodeAt(0);
  }

  public override dump(): string {
    this.flags |= TextElm.FLAG_ESCAPE;
    return (
      `${super.dump()} ${this.size} ` +
      CustomLogicModel.escape(this.text)
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "si", this.size);
    XMLSerializer.dumpAttr(element, "te", this.text);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.size = xml.parseIntAttr("si", this.size);
    this.text = xml.parseStringAttr("te", this.text) ?? this.text;
    this.split();
  }

  public split(): void {
    this.lines = this.text.split(/\n|\\n/);
  }

  public override getPostCount(): number {
    return 0;
  }

  public override getVoltageDiff(): number {
    return 0;
  }

  public override canViewInScope(): boolean {
    return false;
  }
}
