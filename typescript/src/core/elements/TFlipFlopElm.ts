import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Edge-triggered T flip-flop ported from TFlipFlopElm.java. */
export class TFlipFlopElm extends ChipElm {
  public static readonly FLAG_RESET = 2;
  public static readonly FLAG_SET = 4;

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
    this.pins[2].value = !this.pins[1].value;
  }

  public hasSet(): boolean {
    return this.hasFlag(TFlipFlopElm.FLAG_SET);
  }

  public hasReset(): boolean {
    return this.hasFlag(TFlipFlopElm.FLAG_RESET) || this.hasSet();
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 3;
    this.pins = Array<ChipPin>(this.getPostCount());
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "T");
    this.pins[1] = new ChipPin(0, ChipElm.SIDE_E, "Q");
    this.pins[1].output = true;
    this.pins[1].state = true;
    this.pins[2] = new ChipPin(
      this.hasSet() ? 1 : 2,
      ChipElm.SIDE_E,
      "Q"
    );
    this.pins[2].output = true;
    this.pins[2].lineOver = true;
    this.pins[3] = new ChipPin(1, ChipElm.SIDE_W, "");
    this.pins[3].clock = true;
    if (!this.hasSet() && this.hasReset()) {
      this.pins[4] = new ChipPin(2, ChipElm.SIDE_W, "R");
    } else if (this.hasSet()) {
      this.pins[4] = new ChipPin(2, ChipElm.SIDE_E, "R");
      this.pins[5] = new ChipPin(2, ChipElm.SIDE_W, "S");
    }
  }

  public override getPostCount(): number {
    return 4 + (this.hasReset() ? 1 : 0) + (this.hasSet() ? 1 : 0);
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override getChipName(): string {
    return "T flip-flop";
  }

  public override getDumpType(): number {
    return 193;
  }

  public override reset(): void {
    super.reset();
    this.volts[2] = this.highVoltage;
    this.pins[2].value = true;
  }

  public override execute(): void {
    if (this.pins[3].value && !this.lastClock && this.pins[0].value) {
      this.pins[1].value = !this.pins[1].value;
    }
    if (this.hasSet() && this.pins[5].value) {
      this.pins[1].value = true;
    }
    if (this.hasReset() && this.pins[4].value) {
      this.pins[1].value = false;
    }
    this.pins[2].value = !this.pins[1].value;
    this.lastClock = this.pins[3].value;
  }
}
