import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Electrical and serialization port of CurrentElm.java. */
export class CurrentElm extends CircuitElm {
  public currentValue: number;
  public maxVoltage = 0;
  public lastVoltDiff = 0;
  public broken = false;

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
    this.currentValue = 0.01;
    if (tokenizer !== undefined && tokenizer.hasMoreTokens()) {
      this.currentValue = Number(tokenizer.nextToken());
      if (tokenizer.hasMoreTokens()) {
        this.maxVoltage = Number(tokenizer.nextToken());
      }
    }
    if (this.currentValue === 0) {
      this.currentValue = 0.01;
    }
  }

  public isVoltageLimited(): boolean {
    return this.maxVoltage > 0;
  }

  public override nonLinear(): boolean {
    return this.isVoltageLimited();
  }

  public override reset(): void {
    super.reset();
    this.lastVoltDiff = 0;
  }

  public override dump(): string {
    return `${super.dump()} ${this.currentValue} ${this.maxVoltage}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "cu", this.currentValue);
    if (this.maxVoltage > 0) {
      XMLSerializer.dumpAttr(element, "mv", this.maxVoltage);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.currentValue = xml.parseDoubleAttr("cu", this.currentValue);
    this.maxVoltage = xml.parseDoubleAttr("mv", 0);
  }

  public override getDumpType(): number {
    return "i".charCodeAt(0);
  }

  public setBroken(broken: boolean): void {
    this.broken = broken && !this.isVoltageLimited();
  }

  public override stamp(): void {
    if (this.broken) {
      CircuitElm.sim.stampResistor(this.nodes[0], this.nodes[1], 1e8);
      this.current = 0;
    } else if (this.isVoltageLimited()) {
      CircuitElm.sim.stampNonLinear(this.nodes[0]);
      CircuitElm.sim.stampNonLinear(this.nodes[1]);
    } else {
      CircuitElm.sim.stampCurrentSource(
        this.nodes[0],
        this.nodes[1],
        this.currentValue
      );
      this.current = this.currentValue;
    }
  }

  public override doStep(): void {
    if (this.broken || !this.isVoltageLimited()) {
      return;
    }

    let voltageDifference = this.volts[1] - this.volts[0];
    const transitionStart = 0.95 * this.maxVoltage;
    const transitionWidth = this.maxVoltage - transitionStart;
    const transitionMiddle =
      (transitionStart + this.maxVoltage) / 2;
    const thermalVoltage = Math.max(transitionWidth / 5, 1e-3);

    if (
      this.lastVoltDiff < transitionStart &&
      voltageDifference > transitionStart
    ) {
      voltageDifference = transitionStart;
      CircuitElm.sim.converged = false;
    } else if (
      this.lastVoltDiff > this.maxVoltage &&
      voltageDifference < this.maxVoltage
    ) {
      voltageDifference = this.maxVoltage;
      CircuitElm.sim.converged = false;
    } else if (
      this.lastVoltDiff >= transitionStart &&
      this.lastVoltDiff <= this.maxVoltage
    ) {
      const maxStep = Math.max(transitionWidth / 4, 0.01);
      if (voltageDifference > this.lastVoltDiff + maxStep) {
        voltageDifference = this.lastVoltDiff + maxStep;
        CircuitElm.sim.converged = false;
      } else if (voltageDifference < this.lastVoltDiff - maxStep) {
        voltageDifference = this.lastVoltDiff - maxStep;
        CircuitElm.sim.converged = false;
      }
    }
    this.lastVoltDiff = voltageDifference;

    const argument =
      (voltageDifference - transitionMiddle) / thermalVoltage;
    const tanh = Math.tanh(argument);
    const current = this.currentValue * 0.5 * (1 - tanh);
    const sechSquared = 1 - tanh * tanh;
    const conductance =
      (-this.currentValue * 0.5 * sechSquared * voltageDifference) /
      thermalVoltage;
    const absoluteConductance = Math.abs(conductance) + 1e-6;

    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      1 / absoluteConductance
    );
    CircuitElm.sim.stampCurrentSource(
      this.nodes[0],
      this.nodes[1],
      current - conductance * voltageDifference
    );
    this.current = current;
  }

  public override getVoltageDiff(): number {
    return this.volts[1] - this.volts[0];
  }

  public override getPower(): number {
    return -this.getVoltageDiff() * this.current;
  }
}
