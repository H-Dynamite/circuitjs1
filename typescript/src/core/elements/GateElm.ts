import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Shared digital-gate behavior, ported from GateElm.java. */
export abstract class GateElm extends CircuitElm {
  public static readonly FLAG_SMALL = 1;
  public static readonly FLAG_SCHMITT = 2;
  public static readonly FLAG_INVERT_INPUTS = 4;
  public static lastHighVoltage = 5;
  public static lastSchmitt = false;

  public inputCount = 2;
  public lastOutput = false;
  public highVoltage = 5;
  public propagationDelay = 0;
  public delayEndTime = 0;
  public inputStates: boolean[] = [];
  public inPosts: Point[] = [];
  public inGates: Point[] = [];
  public gsize = 2;
  public gwidth = 14;
  public gwidth2 = 28;
  public gheight = 16;
  public hs2 = 28;
  public ww = 28;
  public oscillationCount = 0;
  public lastTime = Number.NaN;

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

    let lastOutputVoltage = 0;
    if (tokenizer?.hasMoreTokens()) {
      const count = Number.parseInt(tokenizer.nextToken(), 10);
      if (Number.isFinite(count) && count >= 1) {
        this.inputCount = count;
      }
    }
    if (tokenizer?.hasMoreTokens()) {
      const output = Number(tokenizer.nextToken());
      if (Number.isFinite(output)) {
        lastOutputVoltage = output;
      }
    }
    if (tokenizer?.hasMoreTokens()) {
      const highVoltage = Number(tokenizer.nextToken());
      if (Number.isFinite(highVoltage)) {
        this.highVoltage = highVoltage;
      }
    } else if (tokenizer === undefined) {
      this.highVoltage = GateElm.lastHighVoltage;
      if (GateElm.lastSchmitt) {
        this.flags |= GateElm.FLAG_SCHMITT;
      }
    }
    if (tokenizer?.hasMoreTokens()) {
      const propagationDelay = Number(tokenizer.nextToken());
      if (Number.isFinite(propagationDelay)) {
        this.propagationDelay = Math.max(0, propagationDelay);
      }
    }

    this.lastOutput = lastOutputVoltage > this.highVoltage * 0.5;
    this.setSize(this.hasFlag(GateElm.FLAG_SMALL) ? 1 : 2);
    this.allocNodes();
    this.setupVolts();
  }

  public override getXmlDumpType(): string {
    return this.getClassName().replace("GateElm", "");
  }

  public override dump(): string {
    const output = this.volts[this.inputCount] ?? (
      this.lastOutput ? this.highVoltage : 0
    );
    return (
      `${super.dump()} ${this.inputCount} ${output} ` +
      `${this.highVoltage} ${this.propagationDelay}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    if (this.highVoltage !== 5) {
      XMLSerializer.dumpAttr(element, "hi", this.highVoltage);
    }
    if (this.inputCount !== 2) {
      XMLSerializer.dumpAttr(element, "in", this.inputCount);
    }
    if (this.propagationDelay !== 0) {
      XMLSerializer.dumpAttr(element, "pd", this.propagationDelay);
    }
    const output = this.volts[this.inputCount] ?? 0;
    if (output !== 0) {
      XMLSerializer.dumpAttr(element, "o", output);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    this.flags = 0;
    super.undumpXml(xml);
    this.highVoltage = xml.parseDoubleAttr("hi", this.highVoltage);
    this.inputCount = Math.max(
      1,
      xml.parseIntAttr("in", this.inputCount)
    );
    this.propagationDelay = Math.max(
      0,
      xml.parseDoubleAttr("pd", 0)
    );
    const lastOutputVoltage = xml.parseDoubleAttr("o", 0);
    this.lastOutput =
      lastOutputVoltage > this.highVoltage * 0.5;
    this.setSize(this.hasFlag(GateElm.FLAG_SMALL) ? 1 : 2);
    this.allocNodes();
    this.setupVolts();
  }

  public setSize(size: number): void {
    this.gsize = size;
    this.gwidth = 7 * size;
    this.gwidth2 = 14 * size;
    this.gheight = 8 * size;
    this.flags &= ~GateElm.FLAG_SMALL;
    if (size === 1) {
      this.flags |= GateElm.FLAG_SMALL;
    }
  }

  public override setPoints(): void {
    super.setPoints();
    this.inputStates = Array<boolean>(this.inputCount).fill(false);
    this.ww = Math.min(this.gwidth2, this.dn / 2);
    if (this.isInverting() && this.ww + 8 > this.dn / 2) {
      this.ww = Math.max(0, this.dn / 2 - 8);
    }
    this.calcLeads(this.ww * 2);

    const denominator = Math.max(this.ww * 2, 1);
    let inputOffset = -Math.floor(this.inputCount / 2);
    this.inPosts = [];
    this.inGates = [];
    for (let index = 0; index < this.inputCount; index += 1) {
      if (inputOffset === 0 && this.inputCount % 2 === 0) {
        inputOffset += 1;
      }
      const perpendicular = this.gheight * inputOffset;
      this.inPosts.push(
        this.interpPoint(this.point1, this.point2, 0, perpendicular)
      );
      const adjustment = this.hasFlag(GateElm.FLAG_INVERT_INPUTS)
        ? -8 / denominator
        : 0;
      this.inGates.push(
        this.interpPoint(
          this.lead1,
          this.lead2,
          adjustment,
          perpendicular
        )
      );
      inputOffset += 1;
    }
    this.hs2 =
      this.gwidth * (Math.floor(this.inputCount / 2) + 1);

    if (this.isInverting()) {
      const distance = Math.max(this.dn, 1);
      this.lead2 = this.interpPoint(
        this.point1,
        this.point2,
        0.5 + (this.ww + 8) / distance
      );
    }
  }

  public setupVolts(): void {
    const inputVoltage =
      this.lastOutput !== this.isInverting()
        ? this.highVoltage
        : 0;
    for (let index = 0; index < this.inputCount; index += 1) {
      this.volts[index] = inputVoltage;
    }
    this.volts[this.inputCount] = this.lastOutput
      ? this.highVoltage
      : 0;
  }

  public isInverting(): boolean {
    return false;
  }

  public hasSchmittInputs(): boolean {
    return this.hasFlag(GateElm.FLAG_SCHMITT);
  }

  public getInput(index: number): boolean {
    const highState = !this.hasFlag(GateElm.FLAG_INVERT_INPUTS);
    if (!this.hasSchmittInputs()) {
      return this.volts[index] > this.highVoltage * 0.5
        ? highState
        : !highState;
    }
    const state =
      this.volts[index] >
      this.highVoltage * (this.inputStates[index] ? 0.35 : 0.55);
    this.inputStates[index] = state;
    return state ? highState : !highState;
  }

  public abstract calcFunction(): boolean;

  public abstract getGateName(): string;

  public override getPostCount(): number {
    return this.inputCount + 1;
  }

  public override getPost(index: number): Point {
    return index === this.inputCount
      ? this.point2
      : (this.inPosts[index] ?? this.point1);
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override setVoltageSource(
    _index: number,
    source: VoltageSource
  ): void {
    this.voltSource = source;
    source.setNodes(
      CircuitNode.ground,
      this.nodes[this.inputCount]
    );
  }

  public override stamp(): void {
    if (this.voltSource === null) {
      throw new Error(`${this.getGateName()} source has not been assigned`);
    }
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[this.inputCount],
      this.voltSource
    );
  }

  public override doStep(): void {
    if (this.voltSource === null) {
      throw new Error(`${this.getGateName()} source has not been assigned`);
    }
    let desired = this.calcFunction();
    if (this.isInverting()) {
      desired = !desired;
    }

    if (this.propagationDelay === 0 && this.lastTime !== CircuitElm.sim.t) {
      if (this.lastOutput !== desired) {
        this.oscillationCount += 1;
        if (this.oscillationCount > 50) {
          this.oscillationCount = 0;
          desired = this.lastOutput;
        }
      } else {
        this.oscillationCount = 0;
      }
      this.lastTime = CircuitElm.sim.t;
    }

    if (this.propagationDelay > 0) {
      if (desired !== this.lastOutput) {
        if (this.delayEndTime === 0) {
          this.delayEndTime =
            CircuitElm.sim.t + this.propagationDelay;
        } else if (CircuitElm.sim.t >= this.delayEndTime) {
          this.lastOutput = desired;
          this.delayEndTime = 0;
        }
      } else {
        this.delayEndTime = 0;
      }
    } else {
      this.lastOutput = desired;
    }

    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[this.inputCount],
      this.voltSource,
      this.lastOutput ? this.highVoltage : 0
    );
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return false;
  }

  public override hasGroundConnection(node: number): boolean {
    return node === this.inputCount;
  }

  public override getCurrentIntoNode(node: number): number {
    return node === this.inputCount ? this.current : 0;
  }
}
