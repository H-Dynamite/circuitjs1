import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Multi-bit analog-to-digital converter. */
export class ADCElm extends ChipElm {
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
      ChipElm.SIDE_E,
      0,
      "D",
      true,
      false,
      false
    );
    this.pins[this.bits] = new ChipPin(0, ChipElm.SIDE_W, "In");
    this.pins[this.bits + 1] = new ChipPin(
      this.sizeY - 1,
      ChipElm.SIDE_W,
      "V+"
    );
    this.allocNodes();
  }

  public override execute(): void {
    const maximum = (1 << this.bits) - 1;
    const reference = this.volts[this.bits + 1];
    const converted =
      reference === 0
        ? 0
        : Math.min(
            maximum,
            Math.max(
              0,
              Math.trunc((maximum * this.volts[this.bits]) / reference)
            )
          );
    for (let index = 0; index < this.bits; index += 1) {
      this.pins[index].value = (converted & (1 << index)) !== 0;
    }
  }

  public override getPostCount(): number {
    return this.bits + 2;
  }

  public override getVoltageSourceCount(): number {
    return this.bits;
  }

  public override getDumpType(): number {
    return 167;
  }

  public override getChipName(): string {
    return "ADC";
  }
}
