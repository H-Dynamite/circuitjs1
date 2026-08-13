import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Named wire connection, ported from LabeledNodeElm.java. */
export class LabeledNodeElm extends CircuitElm {
  public static readonly FLAG_INTERNAL = 1;
  public static readonly FLAG_ESCAPE = 4;
  public static readonly FLAG_ROTATE_TEXT = 8;
  private static readonly labelList = new Map<string, Point>();

  public text = "label";
  public busWidth = 1;
  public currents: number[] | null = null;

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
      const first = tokenizer.nextToken();
      this.text = this.hasFlag(LabeledNodeElm.FLAG_ESCAPE)
        ? CustomLogicModel.unescape(first)
        : [first, ...tokenizer.toArray()].join(" ");
    }
    this.allocNodes();
  }

  public static resetNodeList(): void {
    LabeledNodeElm.labelList.clear();
  }

  public override getDumpType(): number {
    return 207;
  }

  public override getXmlDumpType(): string {
    return "ln";
  }

  public override dump(): string {
    this.flags |= LabeledNodeElm.FLAG_ESCAPE;
    return `${super.dump()} ${CustomLogicModel.escape(this.text)}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "te", this.text);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.text = xml.parseStringAttr("te", this.text) ?? this.text;
  }

  public override setPoints(): void {
    super.setPoints();
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      this.dn === 0 ? 1 : 1 - 17 / this.dn
    );
  }

  public isInternal(): boolean {
    return this.hasFlag(LabeledNodeElm.FLAG_INTERNAL);
  }

  public isRotateText(): boolean {
    return this.hasFlag(LabeledNodeElm.FLAG_ROTATE_TEXT);
  }

  public override getPostCount(): number {
    return this.busWidth;
  }

  public override getPostWidth(_index: number): number {
    return this.busWidth;
  }

  public override getBusWidth(): number {
    return this.busWidth;
  }

  public override getPost(index: number): Point {
    return this.busWidth === 1
      ? this.point1
      : new Point(this.point1.x, this.point1.y, index);
  }

  public override getConnectedPost(index = 0): Point | null {
    const key =
      this.busWidth > 1 ? `${this.text}:${index}` : this.text;
    const existing = LabeledNodeElm.labelList.get(key);
    if (existing !== undefined) {
      return existing;
    }
    LabeledNodeElm.labelList.set(key, this.getPost(index));
    return null;
  }

  public override isWireEquivalent(): boolean {
    return true;
  }

  public override isRemovableWire(): boolean {
    return true;
  }

  public override getConnection(first: number, second: number): boolean {
    return first === second;
  }

  public override setWireCurrent(bit: number, current: number): void {
    if (this.currents === null) {
      this.current = current;
    } else {
      this.currents[bit] = current;
    }
  }

  public override getCurrentIntoNode(index: number): number {
    return this.currents === null
      ? -this.current
      : -this.currents[index];
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public getBusValue(): number {
    let result = 0;
    for (let index = 0; index < this.busWidth; index += 1) {
      if (this.volts[index] > 2.5) {
        result |= 1 << index;
      }
    }
    return result;
  }
}
