import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { Point } from "../Point";
import { SimulationManager } from "../SimulationManager";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Inductor } from "./Inductor";

/** Arbitrary multi-winding/tapped transformer companion model. */
export class CustomTransformerElm extends CircuitElm {
  public static readonly FLAG_FLIP = 1;
  public description = "1,1:1";
  public inductance = 4;
  public couplingCoef = 0.999;
  public width = 32;
  public coilCount = 0;
  public nodeCount = 0;
  public primaryCoils = 0;
  public coilNodes: number[] = [];
  public coilInductances: number[] = [];
  public coilCurrents: number[] = [];
  public coilCurSourceValues: number[] = [];
  public coilPolarities: number[] = [];
  public nodeCurrents: number[] = [];
  public nodePoints: Point[] = [];
  public nodeTaps: Point[] = [];
  public transformMatrix: number[][] | null = null;

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
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer.hasMoreTokens()) {
      const inductance = Number(tokenizer.nextToken());
      if (Number.isFinite(inductance)) this.inductance = inductance;
    }
    if (tokenizer.hasMoreTokens()) {
      const coupling = Number(tokenizer.nextToken());
      if (Number.isFinite(coupling)) this.couplingCoef = coupling;
    }
    if (tokenizer.hasMoreTokens()) {
      this.description = CustomLogicModel.unescape(
        tokenizer.nextToken()
      );
    }
    let savedCount = 0;
    if (tokenizer.hasMoreTokens()) {
      savedCount = Number.parseInt(tokenizer.nextToken(), 10) || 0;
    }
    const savedCurrents: number[] = [];
    for (
      let index = 0;
      index < savedCount && tokenizer.hasMoreTokens();
      index += 1
    ) {
      savedCurrents.push(Number(tokenizer.nextToken()) || 0);
    }
    this.noDiagonal = true;
    this.parseDescription(this.description);
    for (
      let index = 0;
      index < Math.min(savedCurrents.length, this.coilCount);
      index += 1
    ) {
      this.coilCurrents[index] = savedCurrents[index];
    }
  }

  public override getDumpType(): number {
    return 406;
  }

  public override getPostCount(): number {
    return this.nodeCount || 4;
  }

  public isTrapezoidal(): boolean {
    return !this.hasFlag(Inductor.FLAG_BACK_EULER);
  }

  public parseDescription(description: string): boolean {
    const tokens = description
      .split(/([,:+])/)
      .map((token) => token.trim())
      .filter(Boolean);
    let coilCount = 0;
    let nodeCount = 0;
    for (const token of tokens) {
      if (token === "+") nodeCount -= 1;
      else if (token !== "," && token !== ":") {
        const turns = Number(token);
        if (!Number.isFinite(turns) || turns === 0) return false;
        nodeCount += 2;
        coilCount += 1;
      }
    }
    if (coilCount === 0) return false;

    const previousCurrents = this.coilCurrents;
    this.coilCount = coilCount;
    this.nodeCount = nodeCount;
    this.coilNodes = Array(coilCount).fill(0);
    this.coilInductances = Array(coilCount).fill(0);
    this.coilCurrents = Array.from(
      { length: coilCount },
      (_, index) => previousCurrents[index] ?? 0
    );
    this.coilCurSourceValues = Array(coilCount).fill(0);
    this.coilPolarities = Array(coilCount).fill(1);
    this.nodePoints = this.newPointArray(nodeCount);
    this.nodeTaps = this.newPointArray(nodeCount);
    this.nodeCurrents = Array(nodeCount).fill(0);

    let node = 0;
    let coil = 0;
    let secondary = false;
    this.primaryCoils = 0;
    for (const token of tokens) {
      if (token === ",") continue;
      if (token === "+") {
        node -= 1;
        continue;
      }
      if (token === ":") {
        if (secondary) return false;
        secondary = true;
        continue;
      }
      const turns = Number(token);
      this.coilNodes[coil] = node;
      this.coilInductances[coil] =
        turns * turns * this.inductance;
      this.coilPolarities[coil] = turns < 0 ? -1 : 1;
      node += 2;
      coil += 1;
      if (!secondary) this.primaryCoils = coil;
    }
    this.description = description;
    this.transformMatrix = null;
    this.allocNodes();
    this.setPoints();
    return true;
  }

  public override setPoints(): void {
    super.setPoints();
    this.point2.y = this.point1.y;
    const flip = this.hasFlag(CustomTransformerElm.FLAG_FLIP) ? -1 : 1;
    const primaryNodes =
      this.primaryCoils === this.coilCount
        ? this.nodeCount
        : this.coilNodes[this.primaryCoils];
    const distance = Math.max(Math.abs(this.point1.x - this.point2.x), 1);
    const coilEnd = 0.5 - 12 / distance;
    let maximumWidth = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      let coilIndex = 0;
      let offset = 0;
      for (let node = 0; node < this.nodeCount; node += 1) {
        if (node === primaryNodes) offset = 0;
        if (pass === 1) {
          if (node === primaryNodes - 1 || node === this.nodeCount - 1) {
            offset = maximumWidth;
          }
          const side = node < primaryNodes ? 0 : 1;
          this.interpPoint(
            this.point1,
            this.point2,
            this.nodePoints[node],
            side,
            -offset * flip
          );
          this.interpPoint(
            this.point1,
            this.point2,
            this.nodeTaps[node],
            side === 0 ? coilEnd : 1 - coilEnd,
            -offset * flip
          );
        }
        maximumWidth = Math.max(maximumWidth, offset);
        if (this.coilNodes[coilIndex] === node) {
          coilIndex += 1;
          offset += this.width;
        } else {
          offset += 16;
        }
      }
    }
  }

  public override getPost(index: number): Point {
    return this.nodePoints[index] ?? this.point1;
  }

  public override reset(): void {
    super.reset();
    this.coilCurrents.fill(0);
    this.coilCurSourceValues.fill(0);
    this.nodeCurrents.fill(0);
  }

  public override stamp(): void {
    const matrix = Array.from(
      { length: this.coilCount },
      () => Array(this.coilCount).fill(0)
    );
    for (let first = 0; first < this.coilCount; first += 1) {
      matrix[first][first] = this.coilInductances[first];
      for (let second = 0; second < first; second += 1) {
        const mutual =
          this.couplingCoef *
          Math.sqrt(
            this.coilInductances[first] *
              this.coilInductances[second]
          ) *
          this.coilPolarities[first] *
          this.coilPolarities[second];
        matrix[first][second] = mutual;
        matrix[second][first] = mutual;
      }
    }
    SimulationManager.invertMatrix(matrix, this.coilCount);
    const timeScale = this.isTrapezoidal()
      ? CircuitElm.sim.timeStep / 2
      : CircuitElm.sim.timeStep;
    for (let first = 0; first < this.coilCount; first += 1) {
      for (let second = 0; second < this.coilCount; second += 1) {
        matrix[first][second] *= timeScale;
        const firstNode = this.coilNodes[first];
        const secondNode = this.coilNodes[second];
        if (first === second) {
          CircuitElm.sim.stampConductance(
            this.nodes[firstNode],
            this.nodes[firstNode + 1],
            matrix[first][second]
          );
        } else {
          CircuitElm.sim.stampVCCurrentSource(
            this.nodes[firstNode],
            this.nodes[firstNode + 1],
            this.nodes[secondNode],
            this.nodes[secondNode + 1],
            matrix[first][second]
          );
        }
      }
    }
    this.transformMatrix = matrix;
    for (const node of this.nodes) CircuitElm.sim.stampRightSide(node);
  }

  public override startIteration(): void {
    if (this.transformMatrix === null) return;
    for (let coil = 0; coil < this.coilCount; coil += 1) {
      let source = this.coilCurrents[coil];
      if (this.isTrapezoidal()) {
        for (let other = 0; other < this.coilCount; other += 1) {
          const node = this.coilNodes[other];
          source +=
            (this.volts[node] - this.volts[node + 1]) *
            this.transformMatrix[coil][other];
        }
      }
      this.coilCurSourceValues[coil] = source;
    }
  }

  public override doStep(): void {
    for (let coil = 0; coil < this.coilCount; coil += 1) {
      const node = this.coilNodes[coil];
      CircuitElm.sim.stampCurrentSource(
        this.nodes[node],
        this.nodes[node + 1],
        this.coilCurSourceValues[coil]
      );
    }
  }

  public override calculateCurrent(): void {
    this.nodeCurrents.fill(0);
    for (let coil = 0; coil < this.coilCount; coil += 1) {
      let current = this.coilCurSourceValues[coil];
      if (this.transformMatrix !== null) {
        for (let other = 0; other < this.coilCount; other += 1) {
          const node = this.coilNodes[other];
          current +=
            (this.volts[node] - this.volts[node + 1]) *
            this.transformMatrix[coil][other];
        }
      }
      this.coilCurrents[coil] = current;
      const node = this.coilNodes[coil];
      this.nodeCurrents[node] += current;
      this.nodeCurrents[node + 1] -= current;
    }
  }

  public override getCurrentIntoNode(index: number): number {
    return -(this.nodeCurrents[index] ?? 0);
  }

  public override getConnection(first: number, second: number): boolean {
    return this.coilNodes.some((node) =>
      this.comparePair(first, second, node, node + 1)
    );
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.inductance} ${this.couplingCoef} ` +
      `${CustomLogicModel.escape(this.description)} ${this.coilCount} ` +
      this.coilCurrents.join(" ")
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "in", this.inductance);
    XMLSerializer.dumpAttr(element, "cc", this.couplingCoef);
    XMLSerializer.dumpAttr(element, "ds", this.description);
    XMLSerializer.dumpAttr(element, "nc", this.coilCount);
    XMLSerializer.dumpAttr(element, "ci", this.coilCurrents.join(" "));
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.inductance = xml.parseDoubleAttr("in", this.inductance);
    this.couplingCoef = xml.parseDoubleAttr("cc", this.couplingCoef);
    const description =
      xml.parseStringAttr("ds", this.description) ?? this.description;
    const currentText = xml.parseStringAttr("ci", null);
    this.parseDescription(description);
    if (currentText !== null) {
      currentText
        .trim()
        .split(/\s+/)
        .map(Number)
        .forEach((current, index) => {
          if (index < this.coilCurrents.length && Number.isFinite(current)) {
            this.coilCurrents[index] = current;
          }
        });
    }
  }
}
