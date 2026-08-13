import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { ChipElm, ChipPin } from "./ChipElm";

/** Six-terminal voltage-controlled oscillator ported from VCOElm.java. */
export class VCOElm extends ChipElm {
  public readonly cResistance = 1e6;
  public capacitorDirection = 1;

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
    super(
      x,
      y,
      x2,
      y2,
      flags,
      tokenizer ?? new StringTokenizer("")
    );
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 4;
    this.pins = Array<ChipPin>(6);
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "Vi");
    this.pins[1] = new ChipPin(3, ChipElm.SIDE_W, "Vo");
    this.pins[1].output = true;
    this.pins[2] = new ChipPin(0, ChipElm.SIDE_E, "C");
    this.pins[3] = new ChipPin(1, ChipElm.SIDE_E, "C");
    this.pins[4] = new ChipPin(2, ChipElm.SIDE_E, "R1");
    this.pins[4].output = true;
    this.pins[5] = new ChipPin(3, ChipElm.SIDE_E, "R2");
    this.pins[5].output = true;
  }

  public override getChipName(): string {
    return "VCO";
  }

  public override getDumpType(): number {
    return 158;
  }

  public override getPostCount(): number {
    return 6;
  }

  public override getVoltageSourceCount(): number {
    return 3;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    const output = this.requireSource(1);
    const inputCurrent = this.requireSource(4);
    const biasCurrent = this.requireSource(5);
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[1],
      output
    );
    CircuitElm.sim.stampVoltageSource(
      this.nodes[0],
      this.nodes[4],
      inputCurrent,
      0
    );
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[5],
      biasCurrent,
      5
    );
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[3],
      this.cResistance
    );
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
    CircuitElm.sim.stampNonLinear(this.nodes[3]);
  }

  public override doStep(): void {
    const capacitorVoltage = this.volts[3] - this.volts[2];
    let outputVoltage = this.volts[1];
    let direction = outputVoltage < 2.5 ? 1 : -1;
    if (outputVoltage < 2.5 && capacitorVoltage > 4.5) {
      outputVoltage = 5;
      direction = -1;
    }
    if (outputVoltage > 2.5 && capacitorVoltage < 0.5) {
      outputVoltage = 0;
      direction = 1;
    }
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[1],
      this.requireSource(1),
      outputVoltage
    );
    const inputCurrent = this.requireSource(4);
    const biasCurrent = this.requireSource(5);
    CircuitElm.sim.stampMatrix(this.nodes[2], inputCurrent, direction);
    CircuitElm.sim.stampMatrix(this.nodes[2], biasCurrent, direction);
    CircuitElm.sim.stampMatrix(this.nodes[3], inputCurrent, -direction);
    CircuitElm.sim.stampMatrix(this.nodes[3], biasCurrent, -direction);
    this.capacitorDirection = direction;
  }

  public override stepFinished(): void {
    const current =
      this.capacitorDirection *
        (this.pins[4].current + this.pins[5].current) +
      (this.volts[3] - this.volts[2]) / this.cResistance;
    this.pins[2].current = -current;
    this.pins[3].current = current;
    this.pins[0].current = -this.pins[4].current;
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  private requireSource(pin: number): VoltageSource {
    const source = this.pins[pin].voltSource;
    if (source === null) {
      throw new Error(`VCO pin ${pin} source is unassigned`);
    }
    return source;
  }
}
