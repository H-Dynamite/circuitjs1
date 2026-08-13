import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { SimulationManager } from "../SimulationManager";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Dynamic induction-motor model ported from ThreePhaseMotorElm.java. */
export class ThreePhaseMotorElm extends CircuitElm {
  public statorResistance = 0.435;
  public rotorResistance = 0.816;
  public statorInductance = 0.0294;
  public rotorInductance = 0.0297;
  public mutualInductance = 0.0287;
  public friction = 0.05;
  public inertia = 1;
  public angle = Math.PI / 2;
  public speed = 0;
  public filteredSpeed = 0;
  public coilCurrents = Array<number>(5).fill(0);
  public curcounts = Array<number>(3).fill(0);
  public posts: Point[] = [];
  public leads: Point[] = [];
  public motorCenter = new Point();
  private coilSourceValues = Array<number>(5).fill(0);
  private transformMatrix = Array.from(
    { length: 5 },
    () => Array<number>(5).fill(0)
  );
  private voltageSources: Array<VoltageSource | null> = [null, null];
  private backEmf1 = 0;
  private backEmf2 = 0;
  private readonly coilNodes = [6, 1, 8, 3, 10, 5, 7, 9, 11, 12];

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
    const values: number[] = [];
    while (tokenizer?.hasMoreTokens() && values.length < 7) {
      values.push(Number(tokenizer.nextToken()));
    }
    if (Number.isFinite(values[0])) this.statorResistance = values[0];
    if (Number.isFinite(values[1])) this.rotorResistance = values[1];
    if (Number.isFinite(values[2])) this.statorInductance = values[2];
    if (Number.isFinite(values[3])) this.rotorInductance = values[3];
    if (Number.isFinite(values[4])) this.mutualInductance = values[4];
    if (Number.isFinite(values[5])) this.friction = values[5];
    if (Number.isFinite(values[6])) this.inertia = values[6];
  }

  public override getDumpType(): number {
    return 427;
  }

  public override getPostCount(): number {
    return 6;
  }

  public override getInternalNodeCount(): number {
    return 7;
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override setPoints(): void {
    super.setPoints();
    const orientation = Math.abs(this.dy) > Math.abs(this.dx) ? -1 : 1;
    this.posts = this.newPointArray(6);
    this.leads = this.newPointArray(6);
    for (let phase = 0; phase < 3; phase += 1) {
      const leftOffset = -orientation * 32 * (phase - 1);
      const rightOffset = orientation * 32 * (phase - 1);
      this.interpPoint(
        this.point1,
        this.point2,
        this.posts[phase * 2],
        0,
        leftOffset
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.leads[phase * 2],
        0.45,
        leftOffset
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.posts[phase * 2 + 1],
        1,
        rightOffset
      );
      this.interpPoint(
        this.point1,
        this.point2,
        this.leads[phase * 2 + 1],
        0.55,
        rightOffset
      );
    }
    this.motorCenter = this.interpPoint(this.point1, this.point2, 0.5);
    const radius = 37;
    const left = Math.min(
      ...this.posts.map((point) => point.x),
      this.motorCenter.x - radius
    );
    const top = Math.min(
      ...this.posts.map((point) => point.y),
      this.motorCenter.y - radius
    );
    const right = Math.max(
      ...this.posts.map((point) => point.x),
      this.motorCenter.x + radius
    );
    const bottom = Math.max(
      ...this.posts.map((point) => point.y),
      this.motorCenter.y + radius
    );
    this.boundingBox.setBounds(left, top, right - left + 1, bottom - top + 1);
    this.allocNodes();
  }

  public override getPost(index: number): Point {
    return this.posts[index] ?? this.point1;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    source.setNodes(
      this.nodes[index === 0 ? 7 : 11],
      CircuitNode.ground
    );
  }

  public override reset(): void {
    super.reset();
    this.filteredSpeed = this.speed = 0;
    this.coilCurrents.fill(0);
    this.coilSourceValues.fill(0);
    this.curcounts.fill(0);
  }

  public override stamp(): void {
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[6],
      this.statorResistance
    );
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[8],
      this.statorResistance
    );
    CircuitElm.sim.stampResistor(
      this.nodes[4],
      this.nodes[10],
      this.statorResistance
    );
    CircuitElm.sim.stampResistor(
      this.nodes[9],
      CircuitNode.ground,
      1.5 * this.rotorResistance
    );
    CircuitElm.sim.stampResistor(
      this.nodes[12],
      CircuitNode.ground,
      1.5 * this.rotorResistance
    );

    const rotorL = this.rotorInductance * 1.5;
    const inductances = [
      this.statorInductance,
      this.statorInductance,
      this.statorInductance,
      rotorL,
      rotorL
    ];
    const coupling = Array.from(
      { length: 5 },
      () => Array<number>(5).fill(0)
    );
    const baseCoupling =
      this.mutualInductance /
      Math.sqrt(this.statorInductance * rotorL);
    coupling[0][3] = coupling[3][0] = baseCoupling;
    coupling[1][3] = coupling[3][1] = -baseCoupling / 2;
    coupling[1][4] = coupling[4][1] =
      (baseCoupling * Math.sqrt(3)) / 2;
    coupling[2][3] = coupling[3][2] = -baseCoupling / 2;
    coupling[2][4] = coupling[4][2] =
      (-baseCoupling * Math.sqrt(3)) / 2;
    this.transformMatrix = Array.from(
      { length: 5 },
      () => Array<number>(5).fill(0)
    );
    for (let row = 0; row < 5; row += 1) {
      this.transformMatrix[row][row] = inductances[row];
      for (let column = 0; column < row; column += 1) {
        this.transformMatrix[row][column] =
          this.transformMatrix[column][row] =
            coupling[row][column] *
            Math.sqrt(inductances[row] * inductances[column]);
      }
    }
    SimulationManager.invertMatrix(this.transformMatrix, 5);
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        this.transformMatrix[row][column] *=
          CircuitElm.sim.timeStep;
        const rowNode1 = this.coilNodes[row * 2];
        const rowNode2 = this.coilNodes[row * 2 + 1];
        const columnNode1 = this.coilNodes[column * 2];
        const columnNode2 = this.coilNodes[column * 2 + 1];
        if (row === column) {
          CircuitElm.sim.stampConductance(
            this.nodes[rowNode1],
            this.nodes[rowNode2],
            this.transformMatrix[row][column]
          );
        } else {
          CircuitElm.sim.stampVCCurrentSource(
            this.nodes[rowNode1],
            this.nodes[rowNode2],
            this.nodes[columnNode1],
            this.nodes[columnNode2],
            this.transformMatrix[row][column]
          );
        }
      }
    }
    for (const nodeIndex of this.coilNodes) {
      CircuitElm.sim.stampRightSide(this.nodes[nodeIndex]);
    }
    CircuitElm.sim.stampVoltageSource(
      this.nodes[7],
      CircuitNode.ground,
      this.requireSource(0)
    );
    CircuitElm.sim.stampVoltageSource(
      this.nodes[11],
      CircuitNode.ground,
      this.requireSource(1)
    );
  }

  public override startIteration(): void {
    this.coilSourceValues = [...this.coilCurrents];
    const torque =
      Math.sqrt(3) *
      this.mutualInductance *
      ((this.coilCurrents[1] - this.coilCurrents[2]) *
        this.coilCurrents[3] -
        Math.sqrt(3) *
          this.coilCurrents[0] *
          this.coilCurrents[4]);
    this.speed +=
      CircuitElm.sim.timeStep *
      (torque - this.friction * this.speed) /
      this.inertia;
    this.angle += this.speed * CircuitElm.sim.timeStep;
    this.backEmf1 =
      -2 *
      this.speed *
      ((this.mutualInductance * Math.sqrt(3) / 2) *
        (this.coilCurrents[1] - this.coilCurrents[2]) +
        1.5 * this.rotorInductance * this.coilCurrents[4]);
    this.backEmf2 =
      2 *
      this.speed *
      (1.5 * this.mutualInductance * this.coilCurrents[0] +
        1.5 * this.rotorInductance * this.coilCurrents[3]);
  }

  public override doStep(): void {
    for (let coil = 0; coil < 5; coil += 1) {
      CircuitElm.sim.stampCurrentSource(
        this.nodes[this.coilNodes[coil * 2]],
        this.nodes[this.coilNodes[coil * 2 + 1]],
        this.coilSourceValues[coil]
      );
    }
    CircuitElm.sim.updateVoltageSource(
      this.nodes[7],
      CircuitNode.ground,
      this.requireSource(0),
      -this.backEmf1
    );
    CircuitElm.sim.updateVoltageSource(
      this.nodes[11],
      CircuitNode.ground,
      this.requireSource(1),
      -this.backEmf2
    );
  }

  public override calculateCurrent(): void {
    for (let row = 0; row < 5; row += 1) {
      let current = this.coilSourceValues[row];
      for (let column = 0; column < 5; column += 1) {
        const node1 = this.coilNodes[column * 2];
        const node2 = this.coilNodes[column * 2 + 1];
        current +=
          (this.volts[node1] - this.volts[node2]) *
          this.transformMatrix[row][column];
      }
      this.coilCurrents[row] = current;
    }
    this.current = this.coilCurrents[0];
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.statorResistance} ${this.rotorResistance} ` +
      `${this.statorInductance} ${this.rotorInductance} ` +
      `${this.mutualInductance} ${this.friction} ${this.inertia}`
    );
  }

  public override getCurrentIntoNode(index: number): number {
    const current = this.coilCurrents[Math.floor(index / 2)];
    return index % 2 === 0 ? -current : current;
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override canFlipX(): boolean {
    return false;
  }

  public override canFlipY(): boolean {
    return false;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "rs", this.statorResistance);
    XMLSerializer.dumpAttr(element, "rr", this.rotorResistance);
    XMLSerializer.dumpAttr(element, "ls", this.statorInductance);
    XMLSerializer.dumpAttr(element, "lr", this.rotorInductance);
    XMLSerializer.dumpAttr(element, "lm", this.mutualInductance);
    XMLSerializer.dumpAttr(element, "b", this.friction);
    XMLSerializer.dumpAttr(element, "j", this.inertia);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.statorResistance = xml.parseDoubleAttr(
      "rs",
      this.statorResistance
    );
    this.rotorResistance = xml.parseDoubleAttr(
      "rr",
      this.rotorResistance
    );
    this.statorInductance = xml.parseDoubleAttr(
      "ls",
      this.statorInductance
    );
    this.rotorInductance = xml.parseDoubleAttr(
      "lr",
      this.rotorInductance
    );
    this.mutualInductance = xml.parseDoubleAttr(
      "lm",
      this.mutualInductance
    );
    this.friction = xml.parseDoubleAttr("b", this.friction);
    this.inertia = xml.parseDoubleAttr("j", this.inertia);
  }

  private requireSource(index: number): VoltageSource {
    const source = this.voltageSources[index];
    if (source === null) {
      throw new Error(`Motor voltage source ${index} is unassigned`);
    }
    return source;
  }
}
