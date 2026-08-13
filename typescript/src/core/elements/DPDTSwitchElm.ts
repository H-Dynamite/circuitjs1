import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { SwitchElm } from "./SwitchElm";

/** Ganged multi-pole double-throw switch. */
export class DPDTSwitchElm extends SwitchElm {
  public readonly openHeight = 16;
  public poleCount = 2;
  public poleLeads: Point[] = [];
  public throwLeads: Point[] = [];
  public polePosts: Point[] = [];
  public throwPosts: Point[] = [];
  public voltageSources: Array<VoltageSource | null> = [];
  public currents: number[] = [];

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
      this.poleCount =
        Number.parseInt(tokenizer.nextToken(), 10) || this.poleCount;
    }
    this.noDiagonal = true;
    this.posCount = 2;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 429;
  }

  public override getXmlDumpType(): string {
    return "dpdt";
  }

  public override getPostCount(): number {
    return 3 * (this.poleCount || 2);
  }

  public override getVoltageSourceCount(): number {
    return this.poleCount || 2;
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
    this.voltageSources = Array(this.poleCount).fill(null);
    this.throwPosts = this.newPointArray(2 * this.poleCount);
    this.throwLeads = this.newPointArray(4 * this.poleCount);
    this.poleLeads = this.newPointArray(this.poleCount);
    this.polePosts = this.newPointArray(this.poleCount);
    this.currents = Array(this.poleCount).fill(0);
    for (let pole = 0; pole < this.poleCount; pole += 1) {
      const offset = -pole * this.openHeight * 3;
      this.interpPoint(
        this.point1,
        this.point2,
        this.polePosts[pole],
        0,
        offset
      );
      this.interpPoint(
        this.lead1,
        this.lead2,
        this.poleLeads[pole],
        0,
        offset
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.throwPosts[pole * 2],
        1,
        offset - this.openHeight
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.throwPosts[pole * 2 + 1],
        1,
        offset + this.openHeight
      );
      this.interpPoint(
        this.lead1,
        this.lead2,
        this.throwLeads[pole * 4],
        1,
        offset - this.openHeight
      );
      this.interpPoint(
        this.lead1,
        this.lead2,
        this.throwLeads[pole * 4 + 1],
        1,
        offset + this.openHeight
      );
    }
  }

  public override getPost(index: number): Point {
    const pole = Math.floor(index / 3);
    const terminal = index % 3;
    return terminal === 0
      ? (this.polePosts[pole] ?? this.point1)
      : (this.throwPosts[pole * 2 + terminal - 1] ?? this.point2);
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    source.setNodes(
      this.nodes[index * 3],
      this.nodes[index * 3 + this.position + 1]
    );
  }

  public override stamp(): void {
    for (const source of this.voltageSources) {
      if (source === null) {
        throw new Error("DPDT voltage source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(source, 0);
    }
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    const index = this.voltageSources.indexOf(source);
    if (index >= 0) this.currents[index] = current;
  }

  public override getCurrent(): number {
    return this.currents.reduce((sum, value) => sum + value, 0);
  }

  public override getCurrentIntoNode(index: number): number {
    const pole = Math.floor(index / 3);
    const terminal = index % 3;
    if (terminal === 0) return -(this.currents[pole] ?? 0);
    return terminal === this.position + 1
      ? (this.currents[pole] ?? 0)
      : 0;
  }

  public override getConnection(first: number, second: number): boolean {
    for (let pole = 0; pole < this.poleCount; pole += 1) {
      if (
        this.comparePair(
          first,
          second,
          pole * 3,
          pole * 3 + 1 + this.position
        )
      ) {
        return true;
      }
    }
    return false;
  }

  public override isWireEquivalent(): boolean {
    return true;
  }

  public override isRemovableWire(): boolean {
    return false;
  }

  public override dump(): string {
    return `${super.dump()} ${this.poleCount}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "po", this.poleCount);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.poleCount = xml.parseIntAttr("po", this.poleCount);
    this.allocNodes();
  }
}
