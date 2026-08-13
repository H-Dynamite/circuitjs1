import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Electrical waveform and source stamping port of VoltageElm.java. */
export class VoltageElm extends CircuitElm {
  public static readonly FLAG_COS = 2;
  public static readonly FLAG_PULSE_DUTY = 4;
  public static readonly FLAG_CIRCLE_SYMBOL = 8;
  public static readonly FLAG_SHOW_VOLTAGE = 16;
  public static readonly FLAG_TIME_SPEC = 32;
  public static readonly FLAG_SHOW_VOLTAGE_RAIL = 64;

  public static readonly WF_DC = 0;
  public static readonly WF_AC = 1;
  public static readonly WF_SQUARE = 2;
  public static readonly WF_TRIANGLE = 3;
  public static readonly WF_SAWTOOTH = 4;
  public static readonly WF_PULSE = 5;
  public static readonly WF_NOISE = 6;
  public static readonly WF_VAR = 7;
  public static readonly defaultPulseDuty = 1 / (2 * Math.PI);

  public waveform: number;
  public frequency: number;
  public maxVoltage: number;
  public freqTimeZero = 0;
  public bias = 0;
  public phaseShift = 0;
  public dutyCycle = 0.5;
  public noiseValue = 0;
  public riseTime = 0;

  public constructor(x: number, y: number, waveform: number);
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
    x2OrWaveform: number,
    y2?: number,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    const isInteractive = y2 === undefined;
    const x2 = isInteractive ? x : x2OrWaveform;
    super(x, y, x2, y2 ?? y, flags);

    this.maxVoltage = 5;
    this.frequency = isInteractive ? 60 : 40;
    this.waveform = isInteractive
      ? x2OrWaveform
      : VoltageElm.WF_DC;
    if (isInteractive) {
      this.flags |= VoltageElm.FLAG_SHOW_VOLTAGE;
    } else if (tokenizer !== undefined) {
      const values: number[] = [];
      while (values.length < 6 && tokenizer.hasMoreTokens()) {
        values.push(Number(tokenizer.nextToken()));
      }
      if (values.length > 0) this.waveform = values[0];
      if (values.length > 1) this.frequency = values[1];
      if (values.length > 2) this.maxVoltage = values[2];
      if (values.length > 3) this.bias = values[3];
      if (values.length > 4) this.phaseShift = values[4];
      if (values.length > 5) this.dutyCycle = values[5];
    }

    if ((this.flags & VoltageElm.FLAG_COS) !== 0) {
      this.flags &= ~VoltageElm.FLAG_COS;
      this.phaseShift = Math.PI / 2;
    }
    if (
      (this.flags & VoltageElm.FLAG_PULSE_DUTY) === 0 &&
      this.waveform === VoltageElm.WF_PULSE
    ) {
      this.dutyCycle = VoltageElm.defaultPulseDuty;
    }
    this.reset();
  }

  public override getDumpType(): number {
    return "v".charCodeAt(0);
  }

  public override setPoints(): void {
    super.setPoints();
    const circle =
      this.waveform === VoltageElm.WF_DC &&
      this.hasFlag(VoltageElm.FLAG_CIRCLE_SYMBOL);
    this.calcLeads(
      circle
        ? 34
        : this.waveform === VoltageElm.WF_DC ||
            this.waveform === VoltageElm.WF_VAR
          ? 8
          : 34
    );
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.waveform} ${this.frequency} ` +
      `${this.maxVoltage} ${this.bias} ${this.phaseShift} ` +
      `${this.dutyCycle}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "wf", this.waveform);
    if (this.waveform !== VoltageElm.WF_DC) {
      XMLSerializer.dumpAttr(element, "fr", this.frequency);
    }
    XMLSerializer.dumpAttr(element, "maxv", this.maxVoltage);
    if (this.bias !== 0) XMLSerializer.dumpAttr(element, "bias", this.bias);
    if (this.phaseShift !== 0) {
      XMLSerializer.dumpAttr(element, "phaseShift", this.phaseShift);
    }
    if (this.dutyCycle !== 0.5) {
      XMLSerializer.dumpAttr(element, "dutyCycle", this.dutyCycle);
    }
    if (this.riseTime !== 0) {
      XMLSerializer.dumpAttr(element, "riseTime", this.riseTime);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.waveform = xml.parseIntAttr("wf", this.waveform);
    this.frequency = xml.parseDoubleAttr("fr", this.frequency);
    this.maxVoltage = xml.parseDoubleAttr("maxv", this.maxVoltage);
    this.bias = xml.parseDoubleAttr("bias", this.bias);
    this.phaseShift = xml.parseDoubleAttr("phaseShift", this.phaseShift);
    this.dutyCycle = xml.parseDoubleAttr("dutyCycle", this.dutyCycle);
    this.riseTime = xml.parseDoubleAttr("riseTime", this.riseTime);
  }

  public override reset(): void {
    this.freqTimeZero = 0;
    this.curcount = 0;
  }

  public triangleFunc(value: number): number {
    return value < Math.PI
      ? value * (2 / Math.PI) - 1
      : 1 - (value - Math.PI) * (2 / Math.PI);
  }

  public getVoltageSource(): VoltageSource | null {
    return this.voltSource;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    source.setNodes(this.nodes[0], this.nodes[1]);
  }

  public override stamp(): void {
    const source = this.requireVoltageSource();
    if (this.waveform === VoltageElm.WF_DC) {
      CircuitElm.sim.stampVoltageSource(
        this.nodes[0],
        this.nodes[1],
        source,
        this.getVoltage()
      );
    } else {
      CircuitElm.sim.stampVoltageSource(
        this.nodes[0],
        this.nodes[1],
        source
      );
    }
  }

  public override doStep(): void {
    if (this.waveform !== VoltageElm.WF_DC) {
      CircuitElm.sim.updateVoltageSource(
        this.nodes[0],
        this.nodes[1],
        this.requireVoltageSource(),
        this.getVoltage()
      );
    }
  }

  public override stepFinished(): void {
    if (this.waveform === VoltageElm.WF_NOISE) {
      this.noiseValue =
        (Math.random() * 2 - 1) * this.maxVoltage + this.bias;
    }
  }

  public getVoltage(): number {
    if (this.waveform !== VoltageElm.WF_DC && this.doDcAnalysis()) {
      return this.bias;
    }

    const angle =
      2 *
        Math.PI *
        (CircuitElm.sim.t - this.freqTimeZero) *
        this.frequency +
      this.phaseShift;
    const phase = angle % (2 * Math.PI);
    switch (this.waveform) {
      case VoltageElm.WF_DC:
        return this.maxVoltage + this.bias;
      case VoltageElm.WF_AC:
        return Math.sin(angle) * this.maxVoltage + this.bias;
      case VoltageElm.WF_SQUARE:
        return this.squareVoltage(phase);
      case VoltageElm.WF_TRIANGLE:
        return this.bias + this.triangleFunc(phase) * this.maxVoltage;
      case VoltageElm.WF_SAWTOOTH:
        return (
          this.bias +
          phase * (this.maxVoltage / Math.PI) -
          this.maxVoltage
        );
      case VoltageElm.WF_PULSE:
        return this.pulseVoltage(phase);
      case VoltageElm.WF_NOISE:
        return this.noiseValue;
      default:
        return 0;
    }
  }

  public getRmsMultiplier(): number {
    switch (this.waveform) {
      case VoltageElm.WF_AC:
        return 1 / Math.sqrt(2);
      case VoltageElm.WF_TRIANGLE:
      case VoltageElm.WF_SAWTOOTH:
        return 1 / Math.sqrt(3);
      case VoltageElm.WF_PULSE:
        return Math.sqrt(this.dutyCycle);
      default:
        return 1;
    }
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override getPower(): number {
    return -this.getVoltageDiff() * this.current;
  }

  public override getVoltageDiff(): number {
    return this.volts[1] - this.volts[0];
  }

  public setFrequency(frequency: number): void {
    const oldFrequency = this.frequency;
    this.frequency = Math.min(
      frequency,
      1 / (8 * CircuitElm.sim.maxTimeStep)
    );
    this.freqTimeZero =
      this.frequency === 0
        ? 0
        : CircuitElm.sim.t -
          (oldFrequency *
            (CircuitElm.sim.t - this.freqTimeZero)) /
            this.frequency;
  }

  public setFrequencyFromTimes(highTime: number, lowTime: number): void {
    this.setFrequency(1 / (highTime + lowTime));
    this.dutyCycle = highTime / (highTime + lowTime);
  }

  private squareVoltage(phase: number): number {
    const dutyPhase = 2 * Math.PI * this.dutyCycle;
    if (this.riseTime <= 0) {
      return (
        this.bias +
        (phase > dutyPhase ? -this.maxVoltage : this.maxVoltage)
      );
    }
    return this.rampedVoltage(phase, dutyPhase, true);
  }

  private pulseVoltage(phase: number): number {
    const dutyPhase = 2 * Math.PI * this.dutyCycle;
    if (this.riseTime <= 0) {
      return phase < dutyPhase
        ? this.maxVoltage + this.bias
        : this.bias;
    }
    return this.rampedVoltage(phase, dutyPhase, false);
  }

  private rampedVoltage(
    phase: number,
    dutyPhase: number,
    bipolar: boolean
  ): number {
    const risePhase =
      this.riseTime * this.frequency * 2 * Math.PI;
    const halfRise = risePhase / 2;
    const low = bipolar ? -this.maxVoltage : 0;
    if (phase < halfRise) {
      const fraction = (phase + halfRise) / risePhase;
      return (
        this.bias +
        (bipolar
          ? this.maxVoltage * (2 * fraction - 1)
          : this.maxVoltage * fraction)
      );
    }
    if (phase < dutyPhase - halfRise) {
      return this.bias + this.maxVoltage;
    }
    if (phase < dutyPhase + halfRise) {
      const fraction =
        (phase - dutyPhase + halfRise) / risePhase;
      return (
        this.bias +
        (bipolar
          ? this.maxVoltage * (1 - 2 * fraction)
          : this.maxVoltage * (1 - fraction))
      );
    }
    if (phase < 2 * Math.PI - halfRise) {
      return this.bias + low;
    }
    const fraction =
      (phase - (2 * Math.PI - halfRise)) / risePhase;
    return (
      this.bias +
      (bipolar
        ? this.maxVoltage * (2 * fraction - 1)
        : this.maxVoltage * fraction)
    );
  }

  private requireVoltageSource(): VoltageSource {
    if (this.voltSource === null) {
      throw new Error("Voltage source has not been assigned");
    }
    return this.voltSource;
  }
}
