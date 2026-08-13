import { CircuitNode } from "../CircuitNode";
import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { TransistorElm } from "./TransistorElm";

/**
 * Darlington pair using the same two-transistor composite as the Java
 * implementation. It remains a TransistorElm subclass so the existing
 * three-terminal symbol renderer can be reused.
 */
export class DarlingtonElm extends TransistorElm {
  private pair: [TransistorElm, TransistorElm];

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
    const tokens = tokenizer?.toArray() ?? [];
    const pnp = Number(tokens[tokens.length - 1]) === -1 ? -1 : 1;
    super(
      x,
      y,
      x2,
      y2,
      flags,
      new StringTokenizer(`${pnp} 0 0 100 default`)
    );
    this.pair = [
      this.createChild(tokens[0], pnp),
      this.createChild(tokens[1], pnp)
    ];
    this.noDiagonal = true;
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 400;
  }

  public override getXmlDumpType(): string {
    return "dar";
  }

  public override getInternalNodeCount(): number {
    return 1;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override preStamp(): void {
    for (const child of this.pair) child.preStamp();
    this.allocNodes();
  }

  public override setNode(index: number, node: CircuitNode): void {
    super.setNode(index, node);
    if (this.pair === undefined) return;
    if (index === 0) this.pair[0].setNode(0, node);
    if (index === 1) {
      this.pair[0].setNode(1, node);
      this.pair[1].setNode(1, node);
    }
    if (index === 2) this.pair[1].setNode(2, node);
    if (index === 3) {
      this.pair[0].setNode(2, node);
      this.pair[1].setNode(0, node);
    }
  }

  public override setNodeVoltage(index: number, voltage: number): void {
    this.volts[index] = voltage;
    if (index === 0) this.pair[0].setNodeVoltage(0, voltage);
    if (index === 1) {
      this.pair[0].setNodeVoltage(1, voltage);
      this.pair[1].setNodeVoltage(1, voltage);
    }
    if (index === 2) this.pair[1].setNodeVoltage(2, voltage);
    if (index === 3) {
      this.pair[0].setNodeVoltage(2, voltage);
      this.pair[1].setNodeVoltage(0, voltage);
    }
  }

  public override stamp(): void {
    for (const child of this.pair) child.stamp();
  }

  public override startIteration(): void {
    for (const child of this.pair) child.startIteration();
  }

  public override doStep(): void {
    for (const child of this.pair) child.doStep();
  }

  public override stepFinished(): void {
    for (const child of this.pair) child.stepFinished();
  }

  public override calculateCurrent(): void {
    for (const child of this.pair) child.calculateCurrent();
  }

  public override reset(): void {
    super.reset();
    if (this.pair !== undefined) {
      for (const child of this.pair) child.reset();
    }
  }

  public override getCurrentIntoNode(index: number): number {
    if (index === 0) return this.pair[0].getCurrentIntoNode(0);
    if (index === 1) {
      return (
        this.pair[0].getCurrentIntoNode(1) +
        this.pair[1].getCurrentIntoNode(1)
      );
    }
    if (index === 2) return this.pair[1].getCurrentIntoNode(2);
    return (
      this.pair[0].getCurrentIntoNode(2) +
      this.pair[1].getCurrentIntoNode(0)
    );
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return false;
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override getPower(): number {
    return this.pair[0].getPower() + this.pair[1].getPower();
  }

  public override dump(): string {
    const states = this.pair.map((child) => {
      const fields = child.dump().trim().split(/\s+/).slice(5);
      return CustomLogicModel.escape(fields.join(" "));
    });
    return `${CircuitElm.prototype.dump.call(this)} ${states[0]} ${
      states[1]
    } ${this.pnp}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    CircuitElm.prototype.dumpXml.call(this, document, element);
    XMLSerializer.dumpAttr(element, "pnp", this.pnp);
    for (let index = 0; index < this.pair.length; index += 1) {
      const child = this.pair[index];
      const state = document.createElement(child.getXmlDumpType());
      child.dumpXmlState(document, state);
      XMLSerializer.dumpAttr(state, "ix", index);
      element.appendChild(state);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    CircuitElm.prototype.undumpXml.call(this, xml);
    this.pnp = xml.parseIntAttr("pnp", this.pnp);
    const parent = xml.currentXmlElement;
    for (const childState of xml.getChildElements()) {
      xml.parseChildElement(childState);
      const index = xml.parseIntAttr("ix", -1);
      this.pair[index]?.undumpXml(xml);
    }
    if (parent !== null) xml.parseChildElement(parent);
    for (const child of this.pair) {
      child.pnp = this.pnp;
      child.setup();
    }
  }

  private createChild(
    raw: string | undefined,
    pnp: number
  ): TransistorElm {
    if (raw === undefined) {
      return new TransistorElm(0, 0, pnp === -1);
    }
    const decoded = raw.replace(/_/g, " ");
    const fields = decoded.trim().split(/\s+/);
    const childFlags = Number.parseInt(fields.shift() ?? "0", 10);
    return new TransistorElm(
      0,
      0,
      0,
      0,
      Number.isFinite(childFlags) ? childFlags : 0,
      new StringTokenizer(fields.join(" "))
    );
  }
}
