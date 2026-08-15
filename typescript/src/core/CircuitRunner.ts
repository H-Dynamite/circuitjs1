import { CircuitElm } from "./CircuitElm";
import type {
  CircuitElementRecord,
  CircuitScopeRecord
} from "./CircuitLoader";
import { CircuitLoader } from "./CircuitLoader";
import { CircuitMatrix } from "./CircuitMatrix";
import { CircuitNode } from "./CircuitNode";
import { CircuitNodeLink } from "./CircuitNodeLink";
import { CustomLogicModel } from "./CustomLogicModel";
import { CustomCompositeModel } from "./CustomCompositeModel";
import { DiodeModel } from "./DiodeModel";
import { ElementFactory } from "./ElementFactory";
import { Point } from "./Point";
import { SimulationManager } from "./SimulationManager";
import { StringTokenizer } from "./StringTokenizer";
import { TransistorModel } from "./TransistorModel";
import { VoltageSource } from "./VoltageSource";
import type { XmlRecord } from "./XMLDeserializer";
import { XMLDeserializer } from "./XMLDeserializer";
import {
  CapacitorElm,
  GroundElm,
  CurrentElm,
  LabeledNodeElm,
  RailElm,
  TransistorElm,
  VoltageElm
} from "./elements";
import { SparseLU } from "./matrix";

class DisjointSet {
  private readonly parents = new Map<string, string>();

  public add(value: string): void {
    if (!this.parents.has(value)) {
      this.parents.set(value, value);
    }
  }

  public find(value: string): string {
    this.add(value);
    const parent = this.parents.get(value) as string;
    if (parent === value) {
      return value;
    }
    const root = this.find(parent);
    this.parents.set(value, root);
    return root;
  }

  public union(first: string, second: string): void {
    const firstRoot = this.find(first);
    const secondRoot = this.find(second);
    if (firstRoot !== secondRoot) {
      this.parents.set(secondRoot, firstRoot);
    }
  }
}

export interface CircuitStepResult {
  converged: boolean;
  iterations: number;
  time: number;
}

export interface SolverTraceSample {
  subIteration: number;
  index: number;
  type: string;
  volts: number[];
  current: number;
  lastVbe: number | null;
  lastVbc: number | null;
  capacitorVoltage: number | null;
  capacitorSource: number | null;
}

export interface CircuitScopePlot {
  elementIndex: number;
  value: number;
  panel: number;
  scale: number | null;
  /** Identity of the legacy Scope record which owns this plot. */
  scopeId: number;
}

/**
 * Native TypeScript circuit execution layer.
 *
 * It keeps the original analyzeCircuit/runCircuit naming and MNA lifecycle,
 * while supporting the element classes that have already been migrated.
 */
export class CircuitRunner {
  public readonly simulation: SimulationManager;
  public readonly elements: CircuitElm[];
  public nodeList: CircuitNode[] = [];
  public voltageSources: VoltageSource[] = [];
  public unconnectedNodes: CircuitNode[] = [];
  public matrix: CircuitMatrix | null = null;
  public analyzed = false;
  public scopeElementIndices: number[] = [];
  public scopePlots: CircuitScopePlot[] = [];
  public sourceFormat: "text" | "xml" = "text";
  public preservedTextRecords: string[] = [];
  public preservedXmlRecords: XmlRecord[] = [];
  private readonly isolatedRails = new Set<RailElm>();
  private diagnosticTrace: SolverTraceSample[] | null = null;

  public constructor(
    elements: CircuitElm[],
    simulation = new SimulationManager()
  ) {
    this.elements = elements;
    this.simulation = simulation;
    CircuitElm.initClass(simulation);
    for (const element of elements) element.setParentList(elements);
  }

  public static fromText(
    source: string,
    factory = new ElementFactory(),
    simulation = new SimulationManager()
  ): CircuitRunner {
    CircuitElm.initClass(simulation);
    const document = new CircuitLoader().readCircuit(source);
    if (document.format !== "text") {
      throw new Error("CircuitRunner.fromText expects legacy text format");
    }
    if (document.errors.length > 0) {
      throw new Error(document.errors.join("\n"));
    }
    if (document.options !== null) {
      simulation.timeStep = document.options.maxTimeStep;
      simulation.maxTimeStep = document.options.maxTimeStep;
      simulation.minTimeStep =
        document.options.minTimeStep ?? simulation.minTimeStep;
      // The legacy CircuitLoader applies the `$` record's voltage range
      // before elements are analyzed.  It is circuit state, not merely a UI
      // preference, and must survive text import/export just as XML `vr` does.
      CircuitElm.voltageRange = document.options.voltageRange;
      simulation.adjustTimeStep = document.flags.adjustTimeStep;
    }

    const records = document.records.filter(
      (record): record is CircuitElementRecord =>
        record.kind === "element"
    );
    CustomCompositeModel.clear();
    CustomCompositeModel.loadInternalModels(factory);
    for (const record of document.records) {
      if (record.kind !== "model") continue;

      const tokenizer = new StringTokenizer(record.arguments.join(" "));
      if (record.modelType === "!") {
        CustomLogicModel.undumpModel(tokenizer);
      } else if (record.modelType === "32") {
        // Numeric dump type 32 is a TransistorModel definition, not a
        // CircuitElm.  It must be available before the following transistor
        // records resolve their model name (for example, early.txt).
        TransistorModel.undumpModel(tokenizer);
      } else if (record.modelType === "34" || record.modelType === '"') {
        // Numeric dump type 34 and its one-character spelling are diode-model
        // definitions.  As in CircuitLoader.java, they are state records.
        DiodeModel.undumpModel(tokenizer);
      }
    }
    const elements = records.map((record) => {
      const element = factory.createFromRecord(record);
      if (element === null) {
        throw new Error(
          `Element type "${record.type}" has not been migrated`
        );
      }
      return element;
    });
    const runner = new CircuitRunner(elements, simulation);
    runner.sourceFormat = "text";
    runner.preservedTextRecords = document.records
      .filter((record) => record.kind !== "element")
      .map((record) => record.raw);
    runner.scopeElementIndices = document.records
      .filter(
        (record): record is CircuitScopeRecord =>
          record.kind === "scope"
      )
      .map((record) => Number.parseInt(record.arguments[0] ?? "", 10))
      .filter((index) => Number.isFinite(index));
    runner.scopePlots = document.records
      .filter(
        (record): record is CircuitScopeRecord => record.kind === "scope"
      )
      .flatMap((record, scopeId) =>
        CircuitRunner.parseTextScopePlots(record, scopeId)
      )
      .filter(
        (plot) =>
          Number.isFinite(plot.elementIndex) &&
          Number.isFinite(plot.value)
      );
    return runner;
  }

  public static fromXml(
    source: string,
    factory = new ElementFactory(),
    simulation = new SimulationManager()
  ): CircuitRunner {
    CircuitElm.initClass(simulation);
    const document = new CircuitLoader().readCircuit(source);
    if (document.format !== "xml") {
      throw new Error("CircuitRunner.fromXml expects XML circuit format");
    }
    if (document.options.maxTimeStep !== null) {
      simulation.timeStep = document.options.maxTimeStep;
      simulation.maxTimeStep = document.options.maxTimeStep;
    }
    if (document.options.minTimeStep !== null) {
      simulation.minTimeStep = document.options.minTimeStep;
    }
    if (document.options.solverType !== null) {
      simulation.solverType = document.options.solverType;
    }
    if (document.options.voltageRange !== null) {
      CircuitElm.voltageRange = document.options.voltageRange;
    }
    simulation.adjustTimeStep = (document.options.flags & 64) !== 0;

    CustomCompositeModel.clear();
    CustomCompositeModel.loadInternalModels(factory);
    for (const record of document.records) {
      if (record.kind === "model") {
        CircuitRunner.loadXmlModel(record);
      }
    }
    const elements = document.records
      .filter((record) => record.kind === "element")
      .map((record) => {
        const element = factory.createFromXmlRecord(record);
        if (element === null) {
          throw new Error(
            `Element tag <${record.tagName}> has not been migrated`
          );
        }
        return element;
      });
    const runner = new CircuitRunner(elements, simulation);
    runner.sourceFormat = "xml";
    runner.preservedXmlRecords = document.records.filter(
      (record) => record.kind !== "element"
    );
    runner.scopeElementIndices = document.records
      .filter((record) => record.kind === "scope")
      .flatMap((record) =>
        (record.attributes.en ?? "")
          .split(/\s+/)
          .map((value) => Number.parseInt(value, 10))
      )
      .filter((index) => Number.isFinite(index));
    runner.scopePlots = document.records
      .filter((record) => record.kind === "scope")
      .flatMap((record, scopeId) => {
        const defaultElement = Number.parseInt(
          record.attributes.en ?? "",
          10
        );
        const panel = Number.parseInt(record.attributes.p ?? "0", 10);
        if (record.children.length === 0) {
          return [
            {
              elementIndex: defaultElement,
              value: 0,
              panel,
              scale: null,
              scopeId
            }
          ];
        }
        return record.children
          .filter((child) => child.tagName === "p")
          .map((child) => ({
            elementIndex: Number.parseInt(
              child.attributes.e ?? String(defaultElement),
              10
            ),
            value: Number.parseInt(child.attributes.v ?? "0", 10),
            panel,
            scale:
              child.attributes.sc === undefined
                ? null
                : Number(child.attributes.sc),
            scopeId
          }));
      })
      .filter(
        (plot) =>
          Number.isFinite(plot.elementIndex) &&
          Number.isFinite(plot.value)
      );
    return runner;
  }

  private static parseTextScopePlots(
    record: CircuitScopeRecord,
    scopeId: number
  ): CircuitScopePlot[] {
    const args = record.arguments;
    const elementIndex = Number.parseInt(args[0] ?? "", 10);
    const value = Number.parseInt(args[2] ?? "0", 10);
    const flags = Number.parseInt(args[3] ?? "0", 10);
    const voltageScale = Number(args[4] ?? "0");
    const currentScale = Number(args[5] ?? "0");
    const panel = Number.parseInt(args[6] ?? "0", 10);
    const scaleFor = (plotValue: number) => {
      const scale = plotValue === 3 ? currentScale : voltageScale;
      return Number.isFinite(scale) && scale > 0 ? scale : null;
    };
    const plots: CircuitScopePlot[] = [
      {
        elementIndex,
        value,
        panel,
        scale: scaleFor(value),
        scopeId
      }
    ];
    const hasExplicitPlots = (flags & 4096) !== 0;
    if (!hasExplicitPlots) return plots;
    const plotCount = Math.max(1, Number.parseInt(args[7] ?? "1", 10));
    let cursor = 8;
    for (let index = 1; index < plotCount; index += 1) {
      if ((flags & (1 << 18)) !== 0) cursor += 1;
      const nextElement = Number.parseInt(args[cursor] ?? "", 10);
      const nextValue = Number.parseInt(args[cursor + 1] ?? "0", 10);
      cursor += 2;
      if (!Number.isFinite(nextElement) || !Number.isFinite(nextValue)) {
        continue;
      }
      plots.push({
        elementIndex: nextElement,
        value: nextValue,
        panel,
        scale: scaleFor(nextValue),
        scopeId
      });
    }
    return plots;
  }

  public getCircuitNode(index: number): CircuitNode | null {
    return this.nodeList[index] ?? null;
  }

  public getElm(index: number): CircuitElm | null {
    return this.elements[index] ?? null;
  }

  public resetTime(): void {
    this.simulation.t = 0;
  }

  /** Test-only, opt-in solver trace.  It never participates in solving. */
  public beginDiagnosticTrace(): void { this.diagnosticTrace = []; }

  public recordDiagnosticTraceSnapshot(): void {
    this.recordDiagnosticTrace(-1);
  }

  public consumeDiagnosticTrace(): SolverTraceSample[] {
    const trace = this.diagnosticTrace ?? [];
    this.diagnosticTrace = null;
    return trace;
  }

  public analyzeCircuit(): void {
    CircuitElm.initClass(this.simulation);
    GroundElm.resetNodeList();
    LabeledNodeElm.resetNodeList();
    for (const element of this.elements) {
      element.setParentList(this.elements);
      element.setPoints();
      element.preStamp();
      element.allocNodes();
    }

    const sets = new DisjointSet();
    const groundKey = "@ground";
    sets.add(groundKey);
    for (const element of this.elements) {
      for (let post = 0; post < element.getPostCount(); post += 1) {
        sets.add(CircuitRunner.pointKey(element.getPost(post)));
      }
    }

    for (const element of this.elements) {
      if (!element.isRemovableWire()) {
        continue;
      }
      for (let post = 0; post < element.getPostCount(); post += 1) {
        const connected = element.getConnectedPost(post);
        if (connected !== null) {
          sets.union(
            CircuitRunner.pointKey(element.getPost(post)),
            CircuitRunner.pointKey(connected)
          );
        }
      }
    }

    const groundElements = this.elements.filter(
      (element): element is GroundElm => element instanceof GroundElm
    );
    for (const ground of groundElements) {
      sets.union(
        groundKey,
        CircuitRunner.pointKey(ground.getPost(0))
      );
    }

    const hasRail = this.elements.some(
      (element) => element instanceof RailElm
    );
    if (groundElements.length === 0 && !hasRail) {
      const source = this.elements.find(
        (element) => element instanceof VoltageElm
      );
      if (source !== undefined) {
        sets.union(
          groundKey,
          CircuitRunner.pointKey(source.getPost(0))
        );
      }
    }

    const groundNode = new CircuitNode();
    groundNode.index = 0;
    groundNode.row = 0;
    CircuitNode.ground = groundNode;
    this.nodeList = [groundNode];
    const nodeByRoot = new Map<string, CircuitNode>([
      [sets.find(groundKey), groundNode]
    ]);

    for (const element of this.elements) {
      const posts = element.getPostCount();
      for (let post = 0; post < posts; post += 1) {
        const root = sets.find(
          CircuitRunner.pointKey(element.getPost(post))
        );
        let node = nodeByRoot.get(root);
        if (node === undefined) {
          node = new CircuitNode();
          node.index = this.nodeList.length;
          node.row = node.index;
          this.nodeList.push(node);
          nodeByRoot.set(root, node);
        }
        this.linkNode(element, post, node);
      }
      for (
        let internal = 0;
        internal < element.getInternalNodeCount();
        internal += 1
      ) {
        const node = new CircuitNode();
        node.index = this.nodeList.length;
        node.row = node.index;
        node.internal = true;
        this.nodeList.push(node);
        this.linkNode(element, posts + internal, node);
      }
    }

    this.isolatedRails.clear();
    for (const element of this.elements) {
      if (
        element instanceof RailElm &&
        element.getNode(0).links.every((link) => link.elm === element)
      ) {
        this.isolatedRails.add(element);
        element.current = 0;
        element.setNodeVoltage(0, element.getVoltage());
      }
    }

    this.validateCurrentSourcePaths();
    this.findUnconnectedNodes();

    let sourceIndex = 0;
    this.voltageSources = [];
    for (const element of this.elements) {
      if (this.isolatedRails.has(element as RailElm)) {
        continue;
      }
      for (
        let localIndex = 0;
        localIndex < element.getVoltageSourceCount();
        localIndex += 1
      ) {
        const source = new VoltageSource();
        source.index = sourceIndex;
        source.elm = element;
        this.voltageSources.push(source);
        element.setVoltageSource(localIndex, source);
        sourceIndex += 1;
      }
    }

    if (this.getMatrixVariableCount() > 0) {
      this.assignMatrix();
    } else {
      this.matrix = null;
    }
    this.analyzed = true;
  }

  public runCircuit(maxSubIterations = 100): CircuitStepResult {
    if (!this.analyzed) {
      this.analyzeCircuit();
    }
    if (this.getMatrixVariableCount() === 0) {
      this.simulation.subIterations = 0;
      this.simulation.converged = true;
      this.calcWireCurrents();
      if (this.elements.length > 0) {
        this.simulation.t += this.simulation.timeStep;
      }
      return {
        converged: true,
        iterations: 0,
        time: this.simulation.t
      };
    }
    // Companion models calculate their history source from values prepared
    // during stamp(), matching SimulationManager's pre-stamp/stamp lifecycle.
    this.assignMatrix();
    for (const element of this.elements) {
      if (this.isolatedRails.has(element as RailElm)) continue;
      element.stamp();
    }
    for (const element of this.elements) {
      if (this.isolatedRails.has(element as RailElm)) continue;
      element.startIteration();
    }

    const circuitNonLinear = this.elements.some((element) =>
      !this.isolatedRails.has(element as RailElm) && element.nonLinear()
    );
    let converged = false;
    let iterations = 0;
    let lastMaximumDelta = Number.POSITIVE_INFINITY;
    let lastElementConvergence = false;
    for (
      let subIteration = 0;
      subIteration < maxSubIterations;
      subIteration += 1
    ) {
      iterations = subIteration + 1;
      this.simulation.subIterations = subIteration;
      this.simulation.converged = true;
      const previous = this.captureNodeVoltages();
      this.assignMatrix();

      for (const element of this.elements) {
        if (this.isolatedRails.has(element as RailElm)) continue;
        element.stamp();
      }
      this.connectUnconnectedNodes();
      for (const element of this.elements) {
        if (this.isolatedRails.has(element as RailElm)) continue;
        element.doStep();
      }

      // Legacy SimulationManager checks element convergence after doStep()
      // and, for a nonlinear matrix after the first pass, retains the prior
      // solved right-side instead of performing one more LU solve.  Keeping
      // that stopping point is observable for transient circuits whose final
      // Newton correction is small but nonzero.
      if (circuitNonLinear && this.simulation.converged && subIteration > 0) {
        this.recordDiagnosticTrace(subIteration);
        converged = true;
        break;
      }

      const matrix = this.requireMatrix();
      const matrixSnapshot = matrix.matrix.map((row) => [...row]);
      if (
        !SimulationManager.lu_factor(
          matrix.matrix,
          matrix.size,
          matrix.permute,
          matrix
        )
      ) {
        throw new Error(
          `Singular circuit matrix at iteration ${iterations}: ` +
            this.describeSingularMatrix(matrixSnapshot)
        );
      }
      SimulationManager.lu_solve(
        matrix.matrix,
        matrix.size,
        matrix.permute,
        matrix.rightSide,
        matrix
      );
      const maximumDelta = this.applySolution(matrix.rightSide, previous);
      this.recordDiagnosticTrace(subIteration);
      lastMaximumDelta = maximumDelta;
      lastElementConvergence = this.simulation.converged;
      // Match SimulationManager: linear circuits finish after one solve;
      // nonlinear circuits trust the elements' convergence flags and always
      // perform at least two subiterations. A separate max-delta gate can
      // reject valid digital transitions (for example a 5 V gate output).
      if (
        !circuitNonLinear ||
        (this.simulation.converged && subIteration > 0)
      ) {
        converged = true;
        break;
      }
    }

    if (!converged) {
      throw new Error(
        `Circuit failed to converge after ${maxSubIterations} iterations ` +
          `(max delta ${lastMaximumDelta}, element convergence ` +
          `${lastElementConvergence})`
      );
    }
    for (const element of this.elements) {
      if (this.isolatedRails.has(element as RailElm)) continue;
      element.stepFinished();
    }
    this.refreshIsolatedRailVoltages();
    this.calcWireCurrents();
    this.simulation.t += this.simulation.timeStep;
    return {
      converged,
      iterations,
      time: this.simulation.t
    };
  }

  /**
   * Wires are removed from the MNA matrix because both endpoints share one
   * node. Reconstruct each visible wire current from terminal KCL after the
   * element currents have been calculated, matching SimulationManager's
   * calcWireCurrents pass.
   */
  public calcWireCurrents(): void {
    interface WireEdge {
      wire: CircuitElm;
      bit: number;
      startKey: string;
      endKey: string;
    }

    const edges: WireEdge[] = [];
    const adjacency = new Map<string, Set<number>>();
    const injections = new Map<string, number>();
    const blockedLeafKeys = new Set<string>();
    const addAdjacent = (key: string, edge: number): void => {
      let adjacent = adjacency.get(key);
      if (adjacent === undefined) {
        adjacent = new Set<number>();
        adjacency.set(key, adjacent);
      }
      adjacent.add(edge);
    };
    const addEdge = (
      wire: CircuitElm,
      bit: number,
      startKey: string,
      endKey: string
    ): void => {
      if (startKey === endKey) return;
      if (endKey.startsWith("@")) {
        blockedLeafKeys.add(endKey);
      }
      const edge = edges.length;
      edges.push({ wire, bit, startKey, endKey });
      addAdjacent(startKey, edge);
      addAdjacent(endKey, edge);
    };

    for (let elementIndex = 0; elementIndex < this.elements.length; elementIndex += 1) {
      const element = this.elements[elementIndex];
      if (element.isRemovableWire()) {
        for (let bit = 0; bit < element.getBusWidth(); bit += 1) {
          element.setWireCurrent(bit, 0);
          const start = element.getPost(bit);
          const startKey = CircuitRunner.pointKey(start);
          if (element instanceof GroundElm) {
            // Each ground symbol is a separate visible branch even though all
            // ground posts share matrix node zero. Giving every symbol its own
            // hidden endpoint preserves the local branch current and avoids
            // an artificial cycle when a circuit contains several grounds.
            addEdge(element, bit, startKey, `@ground:${elementIndex}`);
            continue;
          }
          if (element instanceof LabeledNodeElm) {
            const labelKey =
              element.getBusWidth() > 1
                ? `@label:${element.text}:${bit}`
                : `@label:${element.text}`;
            addEdge(element, bit, startKey, labelKey);
            continue;
          }
          const end = element.getConnectedPost(bit);
          if (end !== null) {
            addEdge(
              element,
              bit,
              startKey,
              CircuitRunner.pointKey(end)
            );
          }
        }
        continue;
      }

      for (let post = 0; post < element.getPostCount(); post += 1) {
        const current = element.getCurrentIntoNode(post);
        if (!Number.isFinite(current)) continue;
        const key = CircuitRunner.pointKey(element.getPost(post));
        injections.set(key, (injections.get(key) ?? 0) + current);
      }
    }

    const unresolved = new Set(edges.map((_, index) => index));
    const queue = [...adjacency.keys()].filter(
      (key) =>
        !blockedLeafKeys.has(key) &&
        (adjacency.get(key)?.size ?? 0) <= 1
    );
    const queued = new Set(queue);
    const enqueueIfLeaf = (key: string): void => {
      if (
        !queued.has(key) &&
        !blockedLeafKeys.has(key) &&
        (adjacency.get(key)?.size ?? 0) <= 1
      ) {
        queue.push(key);
        queued.add(key);
      }
    };
    const removeEdge = (edgeIndex: number): void => {
      const edge = edges[edgeIndex];
      adjacency.get(edge.startKey)?.delete(edgeIndex);
      adjacency.get(edge.endKey)?.delete(edgeIndex);
      unresolved.delete(edgeIndex);
      enqueueIfLeaf(edge.startKey);
      enqueueIfLeaf(edge.endKey);
    };

    while (unresolved.size > 0) {
      while (queue.length > 0) {
        const key = queue.shift() as string;
        queued.delete(key);
        const adjacent = adjacency.get(key);
        if (adjacent === undefined || adjacent.size !== 1) continue;
        const edgeIndex = adjacent.values().next().value as number;
        if (!unresolved.has(edgeIndex)) continue;
        const edge = edges[edgeIndex];
        const injection = injections.get(key) ?? 0;
        const fromStart = key === edge.startKey;
        const current = fromStart ? injection : -injection;
        edge.wire.setWireCurrent(edge.bit, current);

        const otherKey = fromStart ? edge.endKey : edge.startKey;
        const contributionAtOther = fromStart ? current : -current;
        injections.set(
          otherKey,
          (injections.get(otherKey) ?? 0) + contributionAtOther
        );
        removeEdge(edgeIndex);
      }

      if (unresolved.size > 0) {
        // A closed ideal-wire loop has no unique branch-current solution.
        // Pick one zero-current chord, then resolve the remaining tree by KCL.
        const edgeIndex = unresolved.values().next().value as number;
        const edge = edges[edgeIndex];
        edge.wire.setWireCurrent(edge.bit, 0);
        removeEdge(edgeIndex);
      }
    }
  }

  private static pointKey(point: Point): string {
    return `${point.x},${point.y},${point.z}`;
  }

  private static loadXmlModel(record: XmlRecord): void {
    const document = globalThis.document.implementation.createDocument(
      "",
      record.tagName
    );
    const element = document.documentElement;
    for (const [name, value] of Object.entries(record.attributes)) {
      element.setAttribute(name, value);
    }
    if (record.contents !== null) {
      element.appendChild(document.createTextNode(record.contents));
    }
    const xml = new XMLDeserializer();
    xml.parseChildElement(element);
    if (record.tagName === "dm") {
      const name = xml.parseStringAttr("nm", "default") ?? "default";
      DiodeModel.getModelWithName(name).undumpXml(xml);
    } else if (record.tagName === "tm") {
      TransistorModel.undumpModelXml(xml);
    } else if (record.tagName === "clm") {
      CustomLogicModel.undumpModelXml(xml);
    } else if (record.tagName === "ccm") {
      CustomCompositeModel.load(record);
    }
  }

  private linkNode(
    element: CircuitElm,
    elementNode: number,
    node: CircuitNode
  ): void {
    element.setNode(elementNode, node);
    const link = new CircuitNodeLink();
    link.elm = element;
    link.num = elementNode;
    node.links.push(link);
    if (node === CircuitNode.ground) {
      element.setNodeVoltage(elementNode, 0);
    }
  }

  private findUnconnectedNodes(): void {
    const closure = Array<boolean>(this.nodeList.length).fill(false);
    closure[0] = true;
    this.unconnectedNodes = [];

    let changed = true;
    while (changed) {
      changed = false;
      for (const element of this.elements) {
        if (this.isolatedRails.has(element as RailElm)) continue;
        for (
          let first = 0;
          first < element.getPostCount();
          first += 1
        ) {
          const firstNode = element.getNode(first).index;
          if (
            element.hasGroundConnection(first) &&
            !closure[firstNode]
          ) {
            closure[firstNode] = true;
            changed = true;
          }
          if (!closure[firstNode]) {
            continue;
          }
          for (
            let second = 0;
            second < element.getPostCount();
            second += 1
          ) {
            const secondNode = element.getNode(second).index;
            if (
              first !== second &&
              element.getConnection(first, second) &&
              !closure[secondNode]
            ) {
              closure[secondNode] = true;
              changed = true;
            }
          }
        }
      }
      if (changed) {
        continue;
      }

      const unconnected = this.nodeList.find(
        (node) => !node.internal && !closure[node.index]
      );
      if (unconnected !== undefined) {
        this.unconnectedNodes.push(unconnected);
        closure[unconnected.index] = true;
        changed = true;
      }
    }
  }

  private refreshIsolatedRailVoltages(): void {
    for (const rail of this.isolatedRails) {
      rail.current = 0;
      rail.setNodeVoltage(0, rail.getVoltage());
    }
  }

  /**
   * The original analyzer marks an ideal current source as broken when there
   * is no return path excluding current sources. Stamping a finite resistance
   * in that case prevents a floating current-source terminal from producing a
   * singular MNA row.
   */
  private validateCurrentSourcePaths(): void {
    for (const element of this.elements) {
      if (!(element instanceof CurrentElm)) continue;
      const hasPath = this.findConductivePath(
        element.getNode(1),
        element.getNode(0),
        element,
        new Set<number>()
      );
      element.setBroken(!hasPath);
    }
  }

  private findConductivePath(
    node: CircuitNode,
    destination: CircuitNode,
    excluded: CircuitElm,
    visited: Set<number>
  ): boolean {
    if (node === destination) return true;
    if (visited.has(node.index)) return false;
    visited.add(node.index);

    const visitElement = (
      element: CircuitElm,
      connectedAt: CircuitNode
    ): boolean => {
      if (element === excluded || element instanceof CurrentElm) {
        return false;
      }
      for (let post = 0; post < element.getPostCount(); post += 1) {
        if (element.getNode(post) !== connectedAt) continue;
        if (
          element.hasGroundConnection(post) &&
          this.findConductivePath(
            CircuitNode.ground,
            destination,
            excluded,
            visited
          )
        ) {
          return true;
        }
        for (
          let other = 0;
          other < element.getPostCount();
          other += 1
        ) {
          if (
            other !== post &&
            element.getConnection(post, other) &&
            this.findConductivePath(
              element.getNode(other),
              destination,
              excluded,
              visited
            )
          ) {
            return true;
          }
        }
      }
      return false;
    };

    for (const link of node.links) {
      if (
        link.elm !== null &&
        visitElement(link.elm, node)
      ) {
        return true;
      }
    }
    if (node === CircuitNode.ground) {
      for (const element of this.elements) {
        if (visitElement(element, node)) return true;
        for (
          let post = 0;
          post < element.getPostCount();
          post += 1
        ) {
          if (
            element.hasGroundConnection(post) &&
            this.findConductivePath(
              element.getNode(post),
              destination,
              excluded,
              visited
            )
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private connectUnconnectedNodes(): void {
    for (const node of this.unconnectedNodes) {
      this.simulation.stampResistor(CircuitNode.ground, node, 1e8);
    }
  }

  private assignMatrix(): void {
    const size = this.getMatrixVariableCount();
    if (size <= 0) {
      throw new Error("Circuit has no matrix variables");
    }
    const matrix = new CircuitMatrix(size);
    this.simulation.usingSparse =
      this.simulation.solverType === SimulationManager.SOLVER_SPARSE ||
      (this.simulation.solverType === SimulationManager.SOLVER_AUTO &&
        size >= SimulationManager.SPARSE_THRESHOLD);
    if (this.simulation.usingSparse) {
      matrix.sparseLU = new SparseLU();
    }
    this.matrix = matrix;

    for (const node of this.nodeList) {
      node.matrix = matrix;
    }
    const nodeVariableCount = this.nodeList.length - 1;
    for (let index = 0; index < this.voltageSources.length; index += 1) {
      const source = this.voltageSources[index];
      source.row = nodeVariableCount + index + 1;
      source.matrix = matrix;
    }
  }

  private getMatrixVariableCount(): number {
    return this.nodeList.length - 1 + this.voltageSources.length;
  }

  private captureNodeVoltages(): number[] {
    return this.nodeList.map((node) => {
      if (node === CircuitNode.ground || node.links.length === 0) {
        return 0;
      }
      const link = node.links[0];
      return link.elm?.volts[link.num] ?? 0;
    });
  }

  private applySolution(
    solution: number[],
    previous: number[]
  ): number {
    let maximumDelta = 0;
    for (const node of this.nodeList) {
      const voltage =
        node === CircuitNode.ground ? 0 : solution[node.row - 1];
      maximumDelta = Math.max(
        maximumDelta,
        Math.abs(voltage - previous[node.index])
      );
      for (const link of node.links) {
        if (link.elm !== null) {
          link.elm.volts[link.num] = voltage;
        }
      }
    }
    for (const element of this.elements) {
      element.calculateCurrent();
    }
    for (const source of this.voltageSources) {
      source.elm?.setCurrent(source, solution[source.row - 1]);
    }
    return maximumDelta;
  }

  private recordDiagnosticTrace(subIteration: number): void {
    if (this.diagnosticTrace === null) return;
    for (let index = 0; index < this.elements.length; index += 1) {
      const element = this.elements[index];
      const transistor = element instanceof TransistorElm ? element : null;
      const capacitor = element instanceof CapacitorElm ? element : null;
      this.diagnosticTrace.push({
        subIteration,
        index,
        type: element.constructor.name,
        volts: [...element.volts],
        current: element.current,
        lastVbe: transistor?.lastvbe ?? null,
        lastVbc: transistor?.lastvbc ?? null,
        capacitorVoltage: capacitor?.voltdiff ?? null,
        capacitorSource: capacitor?.curSourceValue ?? null
      });
    }
  }

  private requireMatrix(): CircuitMatrix {
    if (this.matrix === null) {
      throw new Error("Circuit has not been analyzed");
    }
    return this.matrix;
  }

  private describeSingularMatrix(values: number[][]): string {
    const tolerance = 1e-15;
    const zeroRows: number[] = [];
    const zeroColumns: number[] = [];
    for (let row = 0; row < values.length; row += 1) {
      if (values[row].every((value) => Math.abs(value) <= tolerance)) {
        zeroRows.push(row + 1);
      }
    }
    for (let column = 0; column < values.length; column += 1) {
      if (
        values.every(
          (row) => Math.abs(row[column] ?? 0) <= tolerance
        )
      ) {
        zeroColumns.push(column + 1);
      }
    }
    const labels = (rows: number[]): string =>
      rows
        .map((row) => {
          const nodeCount = this.nodeList.length - 1;
          if (row <= nodeCount) {
            const node = this.nodeList[row];
            const links = node?.links
              .map((link) => {
                if (link.elm === null) return "unknown";
                const post = link.elm.getPost(link.num);
                return (
                  `${link.elm.constructor.name}[${link.num}]` +
                  `@${post.x},${post.y}`
                );
              })
              .join("|");
            return `node ${row}${links ? ` ${links}` : ""}`;
          }
          return `source ${row - nodeCount}`;
        })
        .join(", ");
    const details: string[] = [];
    if (zeroRows.length > 0) {
      details.push(`empty rows (${labels(zeroRows)})`);
    }
    if (zeroColumns.length > 0) {
      details.push(`empty columns (${labels(zeroColumns)})`);
    }
    return details.length > 0
      ? details.join("; ")
      : "linearly dependent constraints";
  }
}
