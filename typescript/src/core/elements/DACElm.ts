import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Multi-bit digital-to-analog converter. */
export class DACElm extends ChipElm {
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
    super(x, y, x2, y2, flags, tokenizer ?? new StringTokenizer(""));
  }

  public override needsBits(): boolean {
    return true;
  }

  public override setupPins(): void {
    this.sizeX = 2;
    const bitsY = this.useBus() ? 1 : Math.max(this.bits, 2);
    this.sizeY = Math.max(bitsY, 2);
    this.pins = Array<ChipPin>(this.getPostCount());
    this.makeBitPins(
      this.bits,
      0,
      ChipElm.SIDE_W,
      0,
      "D",
      false,
      false,
      false
    );
    this.pins[this.bits] = new ChipPin(0, ChipElm.SIDE_E, "O");
    this.pins[this.bits].output = true;
    this.pins[this.bits + 1] = new ChipPin(
      this.sizeY - 1,
      ChipElm.SIDE_E,
      "V+"
    );
    this.allocNodes();
  }

  public override doStep(): void {
    let value = 0;
    for (let index = 0; index < this.bits; index += 1) {
      if (this.volts[index] > this.getThreshold()) value |= 1 << index;
    }
    const maximum = (1 << this.bits) - 1;
    const voltage = (value * this.volts[this.bits + 1]) / maximum;
    const source = this.pins[this.bits].voltSource;
    if (source === null) throw new Error("DAC output source is unassigned");
    CircuitElm.sim.updateVoltageSource(
      CircuitNode.ground,
      this.nodes[this.bits],
      source,
      voltage
    );
  }

  public override getPostCount(): number {
    return this.bits + 2;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override getDumpType(): number {
    return 166;
  }

  public override getChipName(): string {
    return "DAC";
  }
}
