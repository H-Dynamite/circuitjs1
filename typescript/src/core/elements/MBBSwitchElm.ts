import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { SwitchElm } from "./SwitchElm";

/** Make-before-break SPDT switch with two intermediate positions. */
export class MBBSwitchElm extends SwitchElm {
  public readonly openHeight = 16;
  public link = 0;
  public voltageSources: Array<VoltageSource | null> = [null, null];
  public currents = [0, 0];
  public both = false;
  public switchPosts: Point[] = [];
  public switchPoles: Point[] = [];

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
      tokenizer ?? new StringTokenizer("0 false")
    );
    if (tokenizer?.hasMoreTokens()) {
      this.link = Number.parseInt(tokenizer.nextToken(), 10) || 0;
    }
    this.noDiagonal = true;
    this.posCount = 4;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 416;
  }

  public override getPostCount(): number {
    return 3;
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.switchPosts = this.newPointArray(2);
    this.switchPoles = this.newPointArray(2);
    for (let index = 0; index < 2; index += 1) {
      const height = index === 0 ? this.openHeight : -this.openHeight;
      this.interpPoint(
        this.lead1,
        this.lead2,
        this.switchPoles[index],
        1,
        height
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.switchPosts[index],
        1,
        height
      );
    }
  }

  public override getPost(index: number): Point {
    return index === 0
      ? this.point1
      : (this.switchPosts[index - 1] ?? this.point2);
  }

  public override getVoltageSourceCount(): number {
    this.both = this.position === 1 || this.position === 3;
    return this.both ? 2 : 1;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    if (this.both) {
      source.setNodes(this.nodes[0], this.nodes[index + 1]);
    } else {
      source.setNodes(
        this.nodes[0],
        this.nodes[this.position === 0 ? 1 : 2]
      );
    }
  }

  public override stamp(): void {
    const count = this.both ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const source = this.voltageSources[index];
      if (source === null) {
        throw new Error("MBB switch source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(source, 0);
    }
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    if (source === this.voltageSources[0]) {
      this.currents[this.both ? 0 : Math.floor(this.position / 2)] =
        current;
    } else if (source === this.voltageSources[1]) {
      this.currents[1] = current;
    }
  }

  public override calculateCurrent(): void {
    if (!this.both) {
      this.currents[1 - Math.floor(this.position / 2)] = 0;
    }
    this.current = this.currents[0] + this.currents[1];
  }

  public override getCurrentIntoNode(index: number): number {
    return index === 0
      ? -this.currents[0] - this.currents[1]
      : this.currents[index - 1];
  }

  public override getConnection(first: number, second: number): boolean {
    return this.both
      ? true
      : this.comparePair(
          first,
          second,
          0,
          1 + Math.floor(this.position / 2)
        );
  }

  public override isWireEquivalent(): boolean {
    return true;
  }

  public override isRemovableWire(): boolean {
    return false;
  }

  public override dump(): string {
    return `${super.dump()} ${this.link}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "li", this.link);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.link = xml.parseIntAttr("li", this.link);
  }
}
