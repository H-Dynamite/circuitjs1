import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Topology and electrical behavior ported from GroundElm.java. */
export class GroundElm extends CircuitElm {
  public static lastSymbolType = 0;
  public static firstGround: Point | null = null;
  public static readonly FLAG_OLD_STYLE = 1;

  public symbolType: number;

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
    this.symbolType = GroundElm.lastSymbolType;
    if (tokenizer?.hasMoreTokens()) {
      const value = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(value)) {
        this.symbolType = value;
      }
    }
  }

  public static resetNodeList(): void {
    GroundElm.firstGround = null;
  }

  public override getDumpType(): number {
    return "g".charCodeAt(0);
  }

  public override getPostCount(): number {
    return 1;
  }

  public override dump(): string {
    return `${super.dump()} ${this.symbolType}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    if (this.symbolType !== 0) {
      XMLSerializer.dumpAttr(element, "sy", this.symbolType);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.symbolType = xml.parseIntAttr("sy", 0);
  }

  public setOldStyle(): void {
    this.flags |= GroundElm.FLAG_OLD_STYLE;
    this.allocNodes();
  }

  public isOldStyle(): boolean {
    return this.hasFlag(GroundElm.FLAG_OLD_STYLE);
  }

  public override getVoltageSourceCount(): number {
    return this.isOldStyle() ? 1 : 0;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    source.setNodes(CircuitNode.ground, this.nodes[0]);
  }

  public override stamp(): void {
    if (this.isOldStyle()) {
      if (this.voltSource === null) {
        throw new Error("Ground voltage source has not been assigned");
      }
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[0],
        this.voltSource,
        0
      );
    }
  }

  public override setCurrent(
    _source: VoltageSource,
    current: number
  ): void {
    this.current = this.isOldStyle() ? -current : current;
  }

  public override isWireEquivalent(): boolean {
    return true;
  }

  public override isRemovableWire(): boolean {
    return true;
  }

  public override getConnectedPost(): Point | null {
    if (GroundElm.firstGround !== null) {
      return GroundElm.firstGround;
    }
    GroundElm.firstGround = this.point1;
    return null;
  }

  public override getVoltageDiff(): number {
    return 0;
  }

  public override hasGroundConnection(_node: number): boolean {
    return true;
  }

  public override getCurrentIntoNode(_node: number): number {
    return -this.current;
  }
}
