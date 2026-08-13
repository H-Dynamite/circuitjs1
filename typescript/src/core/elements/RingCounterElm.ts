import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** One-hot ring counter. */
export class RingCounterElm extends ChipElm {
  public static readonly FLAG_CLOCK_INHIBIT = 2;
  public static readonly FLAG_RESET_HIGH = 4;
  public justLoaded = false;
  public clockInhibit = -1;

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
    flags = RingCounterElm.FLAG_CLOCK_INHIBIT,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags, tokenizer ?? new StringTokenizer(""));
    // Subclass field initializers run after ChipElm's virtual setupPins call.
    this.setupPins();
    this.restoreStatePinValues();
    this.justLoaded = tokenizer !== undefined;
  }

  public override needsBits(): boolean {
    return true;
  }

  public override defaultBitCount(): number {
    return 10;
  }

  public hasClockInhibit(): boolean {
    return (
      this.hasFlag(RingCounterElm.FLAG_CLOCK_INHIBIT) && this.bits >= 3
    );
  }

  public hasInvertReset(): boolean {
    return !this.hasFlag(RingCounterElm.FLAG_RESET_HIGH);
  }

  public override setupPins(): void {
    this.sizeX = Math.max(this.bits, 2);
    this.sizeY = 2;
    this.pins = Array<ChipPin>(this.getPostCount());
    this.pins[0] = new ChipPin(1, ChipElm.SIDE_W, "");
    this.pins[0].clock = true;
    this.pins[1] = new ChipPin(this.sizeX - 1, ChipElm.SIDE_S, "R");
    this.pins[1].lineOver = this.hasInvertReset();
    for (let index = 0; index < this.bits; index += 1) {
      const pin = new ChipPin(index, ChipElm.SIDE_N, `Q${index}`);
      pin.output = true;
      pin.state = true;
      this.pins[index + 2] = pin;
    }
    if (this.hasClockInhibit()) {
      this.clockInhibit = this.pins.length - 1;
      this.pins[this.clockInhibit] = new ChipPin(
        1,
        ChipElm.SIDE_S,
        "CE"
      );
      this.pins[this.clockInhibit].lineOver = true;
    } else {
      this.clockInhibit = -1;
    }
    this.allocNodes();
  }

  public override execute(): void {
    if (this.justLoaded) {
      this.justLoaded = false;
      return;
    }
    const running =
      this.clockInhibit < 0 || !this.pins[this.clockInhibit].value;
    let active = 0;
    while (active < this.bits && !this.pins[active + 2].value) active += 1;
    if (this.pins[0].value && !this.lastClock && running) {
      if (active < this.bits) this.pins[active++ + 2].value = false;
      active %= this.bits;
      this.pins[active + 2].value = true;
    }
    if (this.pins[1].value !== this.hasInvertReset() || active === this.bits) {
      for (let index = 1; index < this.bits; index += 1) {
        this.pins[index + 2].value = false;
      }
      this.pins[2].value = true;
    }
    this.lastClock = this.pins[0].value;
  }

  public override getPostCount(): number {
    return this.bits + (this.hasClockInhibit() ? 3 : 2);
  }

  public override getVoltageSourceCount(): number {
    return this.bits;
  }

  public override getDumpType(): number {
    return 163;
  }

  public override getChipName(): string {
    return "ring counter";
  }
}
