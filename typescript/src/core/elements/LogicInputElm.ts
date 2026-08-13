import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { SwitchElm } from "./SwitchElm";

/** One-terminal digital source, ported from LogicInputElm.java. */
export class LogicInputElm extends SwitchElm {
  public static readonly FLAG_TERNARY = 1;
  public static readonly FLAG_NUMERIC = 2;

  public hiV: number;
  public loV: number;

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
      // Old circuit dumps used boolean switch state. LogicInputElm has the
      // historical inverse mapping used by the Java implementation:
      // "true" means low/position 0 and "false" means high/position 1.
      if (this.legacyPositionWasBoolean) {
        this.position = 1 - this.position;
      }
    }
    this.hiV = 5;
    this.loV = 0;
    if (tokenizer !== undefined) {
      if (tokenizer.hasMoreTokens()) {
        const high = Number(tokenizer.nextToken());
        if (Number.isFinite(high)) {
          this.hiV = high;
        }
      }
      if (tokenizer.hasMoreTokens()) {
        const low = Number(tokenizer.nextToken());
        if (Number.isFinite(low)) {
          this.loV = low;
        }
      }
    }
    this.posCount = this.isTernary() ? 3 : 2;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return "L".charCodeAt(0);
  }

  public override dump(): string {
    return `${super.dump()} ${this.hiV} ${this.loV}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    if (this.hiV !== 5) {
      XMLSerializer.dumpAttr(element, "hi", this.hiV);
    }
    if (this.loV !== 0) {
      XMLSerializer.dumpAttr(element, "lo", this.loV);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.hiV = xml.parseDoubleAttr("hi", this.hiV);
    this.loV = xml.parseDoubleAttr("lo", this.loV);
    this.posCount = this.isTernary() ? 3 : 2;
  }

  public isTernary(): boolean {
    return this.hasFlag(LogicInputElm.FLAG_TERNARY);
  }

  public isNumeric(): boolean {
    return (
      this.flags &
      (LogicInputElm.FLAG_TERNARY | LogicInputElm.FLAG_NUMERIC)
    ) !== 0;
  }

  public getLogicValue(): string {
    if (this.isNumeric()) {
      return String(this.position);
    }
    return this.position === 0 ? "L" : "H";
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

  public override setVoltageSource(
    _index: number,
    source: VoltageSource
  ): void {
    this.voltSource = source;
    source.setNodes(CircuitNode.ground, this.nodes[0]);
  }

  public override stamp(): void {
    if (this.voltSource === null) {
      throw new Error("Logic input voltage source has not been assigned");
    }
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[0],
      this.voltSource
    );
  }

  public override doStep(): void {
    if (this.voltSource === null) {
      throw new Error("Logic input voltage source has not been assigned");
    }
    let voltage = this.position === 0 ? this.loV : this.hiV;
    if (this.isTernary()) {
      voltage =
        this.loV + this.position * (this.hiV - this.loV) * 0.5;
    }
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[0],
      this.voltSource,
      voltage
    );
  }

  public override calculateCurrent(): void {}

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override hasGroundConnection(_node: number): boolean {
    return true;
  }

  public override getCurrentIntoNode(_node: number): number {
    return this.current;
  }

  public override isWireEquivalent(): boolean {
    return false;
  }

  public override isRemovableWire(): boolean {
    return false;
  }
}
