import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { CustomLogicModel } from "../CustomLogicModel";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import type { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { RailElm } from "./RailElm";
import { TransistorElm } from "./TransistorElm";

interface OtaChildBinding {
  element: CircuitElm;
  modelNodes: number[];
  localNodes: number[];
}

const MODEL_EXTERNAL_NODES = [7, 5, 15, 1, 13];
const MODEL_PARTS: ReadonlyArray<{
  type: "rail" | "npn" | "pnp";
  nodes: number[];
}> = [
  { type: "rail", nodes: [4] },
  { type: "rail", nodes: [10] },
  { type: "npn", nodes: [1, 2, 3] },
  { type: "npn", nodes: [3, 1, 4] },
  { type: "npn", nodes: [3, 3, 4] },
  { type: "npn", nodes: [5, 6, 2] },
  { type: "npn", nodes: [7, 8, 2] },
  { type: "pnp", nodes: [9, 6, 10] },
  { type: "pnp", nodes: [9, 9, 10] },
  { type: "pnp", nodes: [6, 12, 9] },
  { type: "pnp", nodes: [11, 8, 10] },
  { type: "pnp", nodes: [11, 11, 10] },
  { type: "pnp", nodes: [8, 13, 11] },
  { type: "npn", nodes: [14, 14, 4] },
  { type: "npn", nodes: [14, 12, 4] },
  { type: "npn", nodes: [12, 13, 14] },
  { type: "npn", nodes: [15, 15, 5] },
  { type: "npn", nodes: [15, 15, 7] }
];

/**
 * LM13700-style OTA implemented with the same two rails and sixteen
 * transistor children used by OTAElm.java. Keeping the original composite
 * topology is important for startup state, limiting and output impedance.
 */
export class OTAElm extends CircuitElm {
  public positiveSupply = 9;
  public negativeSupply = -9;
  private posts: Point[] = [];
  private children: CircuitElm[] = [];
  private bindings: OtaChildBinding[] = [];
  private sourceOwners = new Map<VoltageSource, CircuitElm>();
  private nodeCount = MODEL_EXTERNAL_NODES.length;

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
    this.noDiagonal = true;
    this.buildChildren(tokenizer);
    this.buildBindings();
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 402;
  }

  public override getPostCount(): number {
    return MODEL_EXTERNAL_NODES.length;
  }

  public override getInternalNodeCount(): number {
    return this.nodeCount - this.getPostCount();
  }

  public override getVoltageSourceCount(): number {
    return this.children.reduce(
      (count, child) => count + child.getVoltageSourceCount(),
      0
    );
  }

  public override nonLinear(): boolean {
    return this.children.some((child) => child.nonLinear());
  }

  public override preStamp(): void {
    for (const child of this.children) child.preStamp();
    this.buildBindings();
    this.allocNodes();
  }

  public override setPoints(): void {
    super.setPoints();
    const totalWidth = 2 * 32 + 2 * 19 - 8;
    let leadStart: Point;
    let outputPost: Point;
    if (this.dn > totalWidth) {
      leadStart = this.interpPoint(
        this.point1,
        this.point2,
        1 - totalWidth / this.dn
      );
      outputPost = this.point2;
    } else {
      leadStart = this.point1;
      outputPost = this.interpPoint(
        this.point1,
        this.point2,
        totalWidth / Math.max(this.dn, 1)
      );
    }
    const inputs = this.newPointArray(2);
    this.interpPoint2(
      this.point1,
      outputPost,
      inputs[0],
      inputs[1],
      0,
      32 * this.dsign
    );
    this.posts = [
      inputs[0],
      inputs[1],
      this.point1,
      this.interpPoint(
        leadStart,
        outputPost,
        1 - 16 / totalWidth,
        32
      ),
      outputPost
    ];
  }

  public override getPost(index: number): Point {
    return this.posts[index] ?? this.point1;
  }

  public override setNode(index: number, node: CircuitNode): void {
    super.setNode(index, node);
    for (const binding of this.bindings) {
      binding.localNodes.forEach((localNode, childNode) => {
        if (localNode === index) {
          binding.element.setNode(childNode, node);
        }
      });
    }
  }

  public override setNodeVoltage(index: number, voltage: number): void {
    this.volts[index] = voltage;
    for (const binding of this.bindings) {
      binding.localNodes.forEach((localNode, childNode) => {
        if (localNode === index) {
          binding.element.setNodeVoltage(childNode, voltage);
        }
      });
    }
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    for (const child of this.children) {
      const count = child.getVoltageSourceCount();
      if (index < count) {
        this.sourceOwners.set(source, child);
        source.elm = child;
        child.setVoltageSource(index, source);
        return;
      }
      index -= count;
    }
    throw new Error("OTA voltage source index is invalid");
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    this.sourceOwners.get(source)?.setCurrent(source, current);
  }

  public override setParentList(_elements: CircuitElm[]): void {
    for (const child of this.children) {
      child.setParentList(this.children);
    }
  }

  public override stamp(): void {
    for (const child of this.children) child.stamp();
  }

  public override startIteration(): void {
    for (const child of this.children) child.startIteration();
  }

  public override doStep(): void {
    for (const child of this.children) child.doStep();
  }

  public override stepFinished(): void {
    for (const child of this.children) child.stepFinished();
  }

  public override calculateCurrent(): void {
    for (const child of this.children) child.calculateCurrent();
  }

  public override reset(): void {
    super.reset();
    for (const child of this.children) child.reset();
  }

  public override getPower(): number {
    return this.children.reduce(
      (power, child) => power + child.getPower(),
      0
    );
  }

  public override getCurrentIntoNode(index: number): number {
    let current = 0;
    for (const binding of this.bindings) {
      binding.localNodes.forEach((localNode, childNode) => {
        if (localNode === index) {
          current += binding.element.getCurrentIntoNode(childNode);
        }
      });
    }
    return current;
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

  public override hasGroundConnection(_index: number): boolean {
    return false;
  }

  public override dump(): string {
    const childState = this.children
      .map((child) => {
        const fields = child.dump().trim().split(/\s+/).slice(5);
        return CustomLogicModel.escape(fields.join(" "));
      })
      .join(" ");
    return `${super.dump()} ${childState}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "pv", this.positiveSupply);
    XMLSerializer.dumpAttr(element, "nv", this.negativeSupply);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.positiveSupply = xml.parseDoubleAttr(
      "pv",
      this.positiveSupply
    );
    this.negativeSupply = xml.parseDoubleAttr(
      "nv",
      this.negativeSupply
    );
    const parent = xml.currentXmlElement;
    for (const childState of xml.getChildElements()) {
      xml.parseChildElement(childState);
      const index = xml.parseIntAttr("ix", -1);
      this.children[index]?.undumpXml(xml);
    }
    if (parent !== null) xml.parseChildElement(parent);
    this.applySupplyVoltages();
    this.buildBindings();
    this.allocNodes();
  }

  private buildChildren(tokenizer?: StringTokenizer): void {
    this.children = MODEL_PARTS.map((part, index) => {
      const state = tokenizer?.hasMoreTokens()
        ? this.decodeChildState(tokenizer.nextToken())
        : null;
      const flags = state?.flags ?? 0;
      const stateTokens = new StringTokenizer(state?.values ?? "");
      if (part.type === "rail") {
        const rail =
          state === null
            ? new RailElm(0, 0)
            : new RailElm(0, 0, 0, 0, flags, stateTokens);
        rail.maxVoltage = index === 0
          ? this.negativeSupply
          : this.positiveSupply;
        return rail;
      }
      return state === null
        ? new TransistorElm(0, 0, part.type === "pnp")
        : new TransistorElm(0, 0, 0, 0, flags, stateTokens);
    });
    this.applySupplyVoltages();
  }

  private decodeChildState(raw: string): {
    flags: number;
    values: string;
  } {
    const decoded = this.hasFlag(1)
      ? CustomLogicModel.unescape(raw)
      : raw.replace(/_/g, " ");
    const fields = decoded.trim().split(/\s+/);
    const flags = Number.parseInt(fields.shift() ?? "0", 10);
    return {
      flags: Number.isFinite(flags) ? flags : 0,
      values: fields.join(" ")
    };
  }

  private applySupplyVoltages(): void {
    const negative = this.children[0];
    const positive = this.children[1];
    if (negative instanceof RailElm) {
      negative.maxVoltage = this.negativeSupply;
    }
    if (positive instanceof RailElm) {
      positive.maxVoltage = this.positiveSupply;
    }
  }

  private buildBindings(): void {
    const localByModelNode = new Map<number, number>();
    MODEL_EXTERNAL_NODES.forEach((modelNode, localNode) => {
      localByModelNode.set(modelNode, localNode);
    });
    let nextLocalNode = MODEL_EXTERNAL_NODES.length;
    this.bindings = MODEL_PARTS.map((part, index) => {
      const element = this.children[index];
      const localNodes = part.nodes.map((modelNode) => {
        let localNode = localByModelNode.get(modelNode);
        if (localNode === undefined) {
          localNode = nextLocalNode;
          nextLocalNode += 1;
          localByModelNode.set(modelNode, localNode);
        }
        return localNode;
      });
      return {
        element,
        modelNodes: part.nodes,
        localNodes
      };
    });
    this.nodeCount = nextLocalNode;
  }
}
