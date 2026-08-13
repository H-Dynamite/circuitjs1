import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Multi-bit edge/level-triggered latch. */
export class LatchElm extends ChipElm {
  public static readonly FLAG_STATE = 2;
  public static readonly FLAG_NO_EDGE = 4;
  public static readonly FLAG_RESET = 8;
  public static readonly FLAG_SET = 16;
  public loadPin = 0;
  public resetPin = -1;
  public setPin = -1;
  public lastLoad = false;
  public outputValues: boolean[] = [];

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
    flags = LatchElm.FLAG_STATE,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags, tokenizer ?? new StringTokenizer(""));
    this.flags |= LatchElm.FLAG_STATE;
    this.outputValues = Array.from(
      { length: this.bits },
      (_, index) => this.pins[this.bits + index]?.value ?? false
    );
  }

  public override needsBits(): boolean {
    return true;
  }

  public hasReset(): boolean {
    return this.hasFlag(LatchElm.FLAG_RESET);
  }

  public hasSet(): boolean {
    return this.hasFlag(LatchElm.FLAG_SET);
  }

  public isEdgeTriggered(): boolean {
    return !this.hasFlag(LatchElm.FLAG_NO_EDGE);
  }

  public override setupPins(): void {
    const bits = this.bits || 4;
    this.sizeX = 2;
    this.sizeY = bits + 1 + (this.hasReset() ? 1 : 0) +
      (this.hasSet() ? 1 : 0);
    this.pins = Array<ChipPin>(this.getPostCount());
    this.makeBitPins(
      bits,
      0,
      ChipElm.SIDE_W,
      0,
      "I",
      false,
      false,
      false
    );
    this.makeBitPins(
      bits,
      0,
      ChipElm.SIDE_E,
      bits,
      "O",
      true,
      true,
      false
    );
    let index = bits * 2;
    this.loadPin = index;
    this.pins[index++] = new ChipPin(bits, ChipElm.SIDE_W, "Ld");
    if (this.hasReset()) {
      this.resetPin = index;
      this.pins[index++] = new ChipPin(bits + 1, ChipElm.SIDE_W, "R");
    }
    if (this.hasSet()) {
      this.setPin = index;
      this.pins[index] = new ChipPin(
        bits + (this.hasReset() ? 2 : 1),
        ChipElm.SIDE_W,
        "S"
      );
    }
    this.allocNodes();
  }

  private doLoad(): void {
    if (this.outputValues.length !== this.bits) {
      this.outputValues = Array(this.bits).fill(false);
    }
    if (this.hasSet() && this.pins[this.setPin].value) {
      this.outputValues.fill(true);
    } else if (this.hasReset() && this.pins[this.resetPin].value) {
      this.outputValues.fill(false);
    } else if (
      this.pins[this.loadPin].value &&
      (!this.isEdgeTriggered() || !this.lastLoad)
    ) {
      for (let index = 0; index < this.bits; index += 1) {
        this.outputValues[index] = this.pins[index].value;
      }
    }
    this.lastLoad = this.pins[this.loadPin].value;
  }

  public override execute(): void {
    this.doLoad();
    for (let index = 0; index < this.bits; index += 1) {
      this.pins[this.bits + index].value = this.outputValues[index];
    }
  }

  public override reset(): void {
    super.reset();
    this.outputValues = Array(this.bits).fill(false);
    this.lastLoad = false;
  }

  public override getPostCount(): number {
    return (
      (this.bits || 4) * 2 +
      1 +
      (this.hasReset() ? 1 : 0) +
      (this.hasSet() ? 1 : 0)
    );
  }

  public override getVoltageSourceCount(): number {
    return this.bits || 4;
  }

  public override getDumpType(): number {
    return 168;
  }

  public override getChipName(): string {
    return "Latch";
  }
}
