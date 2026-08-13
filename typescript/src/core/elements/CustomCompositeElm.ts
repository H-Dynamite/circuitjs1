import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import {
  CustomCompositeModel,
  type CustomCompositePin
} from "../CustomCompositeModel";
import type { ElementFactory } from "../ElementFactory";
import { XMLDeserializer, type XmlRecord } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import type { VoltageSource } from "../VoltageSource";
import { ChipElm, ChipPin } from "./ChipElm";
import { GroundElm } from "./GroundElm";
import { LabeledNodeElm } from "./LabeledNodeElm";
import { LineElm } from "./LineElm";
import { RoutedWireElm } from "./RoutedWireElm";
import { ScopeElm } from "./ScopeElm";
import { TextElm } from "./TextElm";
import { WireElm } from "./WireElm";

interface ChildBinding {
  element: CircuitElm;
  nodeIndexes: number[];
}

/**
 * Native TypeScript implementation of XML custom subcircuits (<cc>/<ccm>).
 * Child elements retain their original solver implementations; this class
 * maps model node numbers to the parent element's external/internal nodes and
 * delegates the normal MNA lifecycle to them.
 */
export class CustomCompositeElm extends ChipElm {
  public static readonly FLAG_COMPOSITE_SMALL = 2;
  public modelName = "default";
  public model: CustomCompositeModel | null = null;
  public children: CircuitElm[] = [];
  private bindings: ChildBinding[] = [];
  private childRecords: XmlRecord[] = [];
  private readonly sourceOwners = new Map<VoltageSource, CircuitElm>();
  private compositeNodeCount = 0;

  public constructor(
    x: number,
    y: number,
    private readonly factory: ElementFactory
  ) {
    super(x, y);
    this.noDiagonal = true;
  }

  public override setupPins(): void {
    const model = this.model;
    if (model === null || model === undefined) {
      this.pins = [];
      this.sizeX = 1;
      this.sizeY = 1;
      return;
    }
    this.sizeX = model.sizeX;
    this.sizeY = model.sizeY;
    this.pins = model.pins.map((pin) => this.createPin(pin));
    this.setSize(
      this.hasFlag(CustomCompositeElm.FLAG_COMPOSITE_SMALL) ? 1 : 2
    );
  }

  public override getChipName(): string {
    return this.modelName;
  }

  public override getPostCount(): number {
    return this.pins?.length ?? 0;
  }

  public override getInternalNodeCount(): number {
    return Math.max(0, this.compositeNodeCount - this.getPostCount());
  }

  public override getVoltageSourceCount(): number {
    return this.children.reduce(
      (count, child) => count + child.getVoltageSourceCount(),
      0
    );
  }

  public override getDumpType(): number {
    return 0;
  }

  public override getXmlDumpType(): string {
    return "cc";
  }

  public override nonLinear(): boolean {
    return this.children.some((child) => child.nonLinear());
  }

  public override preStamp(): void {
    for (const child of this.children) child.preStamp();
    this.buildNodeBindings();
    this.allocNodes();
  }

  public override setParentList(_elements: CircuitElm[]): void {
    for (const child of this.children) {
      child.setParentList(this.children);
    }
  }

  public override setNode(index: number, node: CircuitNode): void {
    super.setNode(index, node);
    for (const binding of this.bindings) {
      for (
        let childNode = 0;
        childNode < binding.nodeIndexes.length;
        childNode += 1
      ) {
        if (binding.nodeIndexes[childNode] === index) {
          binding.element.setNode(childNode, node);
        }
      }
    }
  }

  public override setNodeVoltage(index: number, voltage: number): void {
    this.volts[index] = voltage;
    for (const binding of this.bindings) {
      for (
        let childNode = 0;
        childNode < binding.nodeIndexes.length;
        childNode += 1
      ) {
        if (binding.nodeIndexes[childNode] === index) {
          binding.element.setNodeVoltage(childNode, voltage);
        }
      }
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
    throw new Error(
      `${this.modelName} voltage source index is invalid`
    );
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    this.sourceOwners.get(source)?.setCurrent(source, current);
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
      for (
        let childNode = 0;
        childNode < binding.nodeIndexes.length;
        childNode += 1
      ) {
        if (binding.nodeIndexes[childNode] === index) {
          current += binding.element.getCurrentIntoNode(childNode);
        }
      }
    }
    return current;
  }

  public override getConnection(first: number, second: number): boolean {
    return this.areNodesConnected(first, second);
  }

  public override getMatrixConnection(
    first: number,
    second: number
  ): boolean {
    return this.areNodesConnected(first, second, true);
  }

  public override hasGroundConnection(index: number): boolean {
    const visited = new Set<number>();
    const pending = [index];
    while (pending.length > 0) {
      const current = pending.pop() as number;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const binding of this.bindings) {
        for (
          let post = 0;
          post < binding.element.getPostCount();
          post += 1
        ) {
          if (binding.nodeIndexes[post] !== current) continue;
          if (binding.element.hasGroundConnection(post)) return true;
          for (
            let other = 0;
            other < binding.element.getPostCount();
            other += 1
          ) {
            if (
              other !== post &&
              binding.element.getConnection(post, other)
            ) {
              pending.push(binding.nodeIndexes[other]);
            }
          }
        }
      }
    }
    return false;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "mo", this.modelName);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    CircuitElm.prototype.undumpXml.call(this, xml);
    this.modelName =
      xml.parseStringAttr("mo", this.modelName) ?? this.modelName;
    this.model = CustomCompositeModel.get(this.modelName);
    if (this.model === null) {
      throw new Error(
        `Custom composite model "${this.modelName}" was not loaded`
      );
    }
    this.setupPins();
    this.buildChildren();
    this.applyChildState(xml);
    this.buildNodeBindings();
    this.allocNodes();
  }

  private createPin(pin: CustomCompositePin): ChipPin {
    const result = new ChipPin(pin.position, pin.side, pin.name);
    result.busWidth = pin.busWidth;
    result.busZ = pin.busZ;
    return result;
  }

  private buildChildren(): void {
    this.children = [];
    this.childRecords = [];
    if (this.model === null) return;
    for (const record of this.model.elements) {
      const element = this.factory.createFromXmlRecord(record);
      if (element === null || this.isDisplayOnly(element)) continue;
      this.children.push(element);
      this.childRecords.push(record);
    }
    for (const child of this.children) {
      child.setParentList(this.children);
    }
  }

  private applyChildState(xml: XMLDeserializer): void {
    const parent = xml.currentXmlElement;
    for (const state of xml.getChildElements()) {
      const index = Number.parseInt(
        state.getAttribute("ix") ?? "-1",
        10
      );
      const child = this.children[index];
      if (child === undefined) continue;
      xml.parseChildElement(state);
      child.undumpXml(xml);
    }
    if (parent !== null) xml.parseChildElement(parent);
  }

  private buildNodeBindings(): void {
    if (this.model === null) return;
    const nodeIndex = new Map<number, number>();
    this.model.pins.forEach((pin, index) => {
      nodeIndex.set(pin.node, index);
    });
    let nextIndex = this.model.pins.length;
    const bindings: ChildBinding[] = [];
    for (let modelElementIndex = 0;
      modelElementIndex < this.children.length;
      modelElementIndex += 1) {
      const record = this.childRecords[modelElementIndex];
      const child = this.children[modelElementIndex];
      if (child === undefined) continue;
      const numbers = (record.attributes.nn ?? "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10));
      const childIndexes: number[] = [];
      for (let post = 0; post < child.getPostCount(); post += 1) {
        const number = numbers[post] ?? 0;
        if (number === 0) {
          childIndexes.push(-1);
          child.setNode(post, CircuitNode.ground);
          child.setNodeVoltage(post, 0);
          continue;
        }
        let index = nodeIndex.get(number);
        if (index === undefined) {
          index = nextIndex;
          nextIndex += 1;
          nodeIndex.set(number, index);
        }
        childIndexes.push(index);
      }
      for (
        let internal = 0;
        internal < child.getInternalNodeCount();
        internal += 1
      ) {
        childIndexes.push(nextIndex);
        nextIndex += 1;
      }
      bindings.push({ element: child, nodeIndexes: childIndexes });
    }
    this.bindings = bindings;
    this.compositeNodeCount = nextIndex;
  }

  private areNodesConnected(
    first: number,
    second: number,
    matrix = false
  ): boolean {
    if (first === second) return true;
    const visited = new Set<number>();
    const pending = [first];
    while (pending.length > 0) {
      const current = pending.pop() as number;
      if (current === second) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const binding of this.bindings) {
        const element = binding.element;
        for (let post = 0; post < element.getPostCount(); post += 1) {
          if (binding.nodeIndexes[post] !== current) continue;
          for (
            let other = 0;
            other < element.getPostCount();
            other += 1
          ) {
            const connected = matrix
              ? element.getMatrixConnection(post, other)
              : element.getConnection(post, other);
            if (other !== post && connected) {
              pending.push(binding.nodeIndexes[other]);
            }
          }
        }
      }
    }
    return false;
  }

  private isDisplayOnly(element: CircuitElm): boolean {
    return (
      element instanceof WireElm ||
      element instanceof RoutedWireElm ||
      element instanceof LabeledNodeElm ||
      element instanceof ScopeElm ||
      element instanceof TextElm ||
      element instanceof LineElm ||
      (element instanceof GroundElm &&
        (element.x !== 0 || element.y !== 0 || element.x2 !== 0 ||
          element.y2 !== 0))
    );
  }

}
