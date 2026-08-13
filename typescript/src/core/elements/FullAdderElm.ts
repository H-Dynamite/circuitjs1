import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Configurable ripple-carry full adder ported from FullAdderElm.java. */
export class FullAdderElm extends ChipElm {
  public static readonly FLAG_BITS = 2;
  public carryIn = 0;
  public carryOut = 0;

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
    if (tokenizer === undefined) {
      this.flags |= FullAdderElm.FLAG_BITS;
      this.bits = 4;
    } else if (!this.needsBits()) {
      this.bits = 1;
    }
    this.setupPins();
  }

  public override needsBits(): boolean {
    return this.hasFlag(FullAdderElm.FLAG_BITS);
  }

  public override setupPins(): void {
    const bitCount = this.bits || 1;
    const rows = this.useBus() ? 1 : bitCount;
    this.sizeX = 2;
    this.sizeY = rows * 2 + 1;
    this.pins = Array<ChipPin>(bitCount * 3 + 2);
    this.makeBitPins(
      bitCount, 0, ChipElm.SIDE_W, 0, "A", false, false, false
    );
    this.makeBitPins(
      bitCount, rows, ChipElm.SIDE_W, bitCount, "B", false, false, false
    );
    this.makeBitPins(
      bitCount, 2, ChipElm.SIDE_E, bitCount * 2, "S", true, false, false
    );
    this.carryIn = bitCount * 3;
    this.carryOut = bitCount * 3 + 1;
    this.pins[this.carryOut] = new ChipPin(0, ChipElm.SIDE_E, "C");
    this.pins[this.carryOut].output = true;
    this.pins[this.carryIn] = new ChipPin(
      rows * 2,
      ChipElm.SIDE_W,
      "Cin"
    );
    this.allocNodes();
  }

  public override getPostCount(): number {
    return (this.bits || 1) * 3 + 2;
  }

  public override getVoltageSourceCount(): number {
    return (this.bits || 1) + 1;
  }

  public override getChipName(): string {
    return "Adder";
  }

  public override getDumpType(): number {
    return 196;
  }

  public override execute(): void {
    let carry = this.pins[this.carryIn].value ? 1 : 0;
    for (let bit = 0; bit < this.bits; bit += 1) {
      const value =
        (this.pins[bit].value ? 1 : 0) +
        (this.pins[bit + this.bits].value ? 1 : 0) +
        carry;
      carry = value > 1 ? 1 : 0;
      this.writeOutput(bit + this.bits * 2, (value & 1) === 1);
    }
    this.writeOutput(this.carryOut, carry === 1);
  }
}
