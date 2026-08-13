import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { SwitchElm } from "./SwitchElm";

/** SPDT/multi-throw switch, ported from Switch2Elm.java. */
export class Switch2Elm extends SwitchElm {
  public static readonly FLAG_CENTER_OFF = 1;
  public link: number;
  public throwCount: number;
  public positionFlipped: boolean;
  public swposts: Point[];
  public swpoles: Point[];
  private parentElements: CircuitElm[];

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
    if (tokenizer === undefined) {
      super(x, y, false);
    } else {
      super(x, y, x2, y2, flags, tokenizer);
    }
    this.parentElements = [];
    this.link = 0;
    this.throwCount = 2;
    this.positionFlipped = false;
    this.swposts = [];
    this.swpoles = [];
    if (tokenizer?.hasMoreTokens()) {
      const link = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(link)) {
        this.link = link;
      }
    }
    if (tokenizer?.hasMoreTokens()) {
      const count = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(count) && count >= 2) {
        this.throwCount = count;
      }
    }
    this.noDiagonal = true;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return "S".charCodeAt(0);
  }

  public override dump(): string {
    return `${super.dump()} ${this.link} ${this.throwCount}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "li", this.link);
    XMLSerializer.dumpAttr(element, "th", this.throwCount);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.link = xml.parseIntAttr("li", this.link);
    this.throwCount = Math.max(
      2,
      xml.parseIntAttr("th", this.throwCount)
    );
    this.allocNodes();
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.swposts = this.newPointArray(this.throwCount);
    this.swpoles = this.newPointArray(this.throwCount + 1);
    for (let index = 0; index < this.throwCount; index += 1) {
      let offset =
        -16 * (index - Math.floor((this.throwCount - 1) / 2));
      if (this.throwCount === 2 && index === 0) {
        offset = 16;
      }
      this.interpPoint(
        this.lead1,
        this.lead2,
        this.swpoles[index],
        1,
        offset
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.swposts[index],
        1,
        offset
      );
    }
    this.swpoles[this.throwCount] = this.lead2;
    this.posCount = this.hasCenterOff() ? 3 : this.throwCount;
    this.position = Math.min(this.position, this.posCount - 1);
  }

  public override getPostCount(): number {
    return 1 + this.throwCount;
  }

  public override getPost(index: number): Point {
    return index === 0
      ? this.point1
      : (this.swposts[index - 1] ?? this.point2);
  }

  public hasCenterOff(): boolean {
    return (
      this.hasFlag(Switch2Elm.FLAG_CENTER_OFF) &&
      this.throwCount === 2
    );
  }

  public isOpenPosition(): boolean {
    return this.hasCenterOff() && this.position === 2;
  }

  public override calculateCurrent(): void {
    if (this.isOpenPosition()) {
      this.current = 0;
    }
  }

  public override setVoltageSource(
    _index: number,
    source: VoltageSource
  ): void {
    this.voltSource = source;
    source.setNodes(this.nodes[0], this.nodes[this.position + 1]);
  }

  public override stamp(): void {
    if (this.isOpenPosition()) {
      return;
    }
    if (this.voltSource === null) {
      throw new Error("SPDT switch source has not been assigned");
    }
    CircuitElm.sim.stampVoltageSource(
      this.nodes[0],
      this.nodes[this.position + 1],
      this.voltSource,
      0
    );
  }

  public override getVoltageSourceCount(): number {
    return this.isOpenPosition() ? 0 : 1;
  }

  public override getConnection(first: number, second: number): boolean {
    return (
      !this.isOpenPosition() &&
      this.comparePair(first, second, 0, this.position + 1)
    );
  }

  public override getCurrentIntoNode(node: number): number {
    if (node === 0) {
      return -this.current;
    }
    return node === this.position + 1 ? this.current : 0;
  }

  public override setParentList(elements: CircuitElm[]): void {
    this.parentElements = elements;
  }

  public override toggle(): void {
    super.toggle();
    if (this.link === 0) return;

    for (const element of this.parentElements) {
      if (!(element instanceof Switch2Elm) || element.link !== this.link) {
        continue;
      }
      let position = this.position;
      if (element.positionFlipped !== this.positionFlipped) {
        position = this.posCount - 1 - position;
      }
      if (position < element.posCount) {
        element.position = position;
      }
    }
  }

  public override flipX(center2: number, count = 1): void {
    super.flipX(center2, count);
    this.position = this.posCount - 1 - this.position;
    this.positionFlipped = !this.positionFlipped;
  }

  public override flipY(center2: number, count = 1): void {
    super.flipY(center2, count);
    this.position = this.posCount - 1 - this.position;
    this.positionFlipped = !this.positionFlipped;
  }

  public override flipXY(xMinusY: number, count = 1): void {
    super.flipXY(xMinusY, count);
    this.position = this.posCount - 1 - this.position;
    this.positionFlipped = !this.positionFlipped;
  }

  public override isWireEquivalent(): boolean {
    return true;
  }

  public override isRemovableWire(): boolean {
    return false;
  }
}
