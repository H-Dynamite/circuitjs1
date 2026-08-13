import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Three-state phase/frequency comparator ported from PhaseCompElm.java. */
export class PhaseCompElm extends ChipElm {
  public ff1 = false;
  public ff2 = false;

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
    this.sizeY = 2;
    this.pins = Array<ChipPin>(3);
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "I1");
    this.pins[1] = new ChipPin(1, ChipElm.SIDE_W, "I2");
    this.pins[2] = new ChipPin(0, ChipElm.SIDE_E, "O");
    this.pins[2].output = true;
  }

  public override getChipName(): string {
    return "phase comparator";
  }

  public override getDumpType(): number {
    return 161;
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    const source = this.pins[2].voltSource;
    if (source === null) {
      throw new Error("Phase comparator output source is unassigned");
    }
    CircuitElm.sim.stampNonLinear(source);
    CircuitElm.sim.stampNonLinear(CircuitNode.ground);
    CircuitElm.sim.stampNonLinear(this.nodes[2]);
  }

  public override doStep(): void {
    const input1 = this.volts[0] > this.getThreshold();
    const input2 = this.volts[1] > this.getThreshold();
    if (input1 && !this.pins[0].value) this.ff1 = true;
    if (input2 && !this.pins[1].value) this.ff2 = true;
    if (this.ff1 && this.ff2) {
      this.ff1 = false;
      this.ff2 = false;
    }
    const source = this.pins[2].voltSource;
    if (source === null) {
      throw new Error("Phase comparator output source is unassigned");
    }
    if (this.ff1 || this.ff2) {
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[2],
        source,
        this.ff1 ? this.highVoltage : 0
      );
    } else {
      CircuitElm.sim.stampMatrix(source, source, 1);
    }
    this.pins[0].value = input1;
    this.pins[1].value = input2;
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }
}
