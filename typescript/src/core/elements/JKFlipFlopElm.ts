import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

export class JKFlipFlopElm extends ChipElm {
  public static readonly FLAG_RESET = 2;
  public static readonly FLAG_POSITIVE_EDGE = 4;
  public static readonly FLAG_INVERT_RESET = 8;
  public justLoaded = false;

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
    this.pins[4].value = !this.pins[3].value;
    this.justLoaded = tokenizer !== undefined;
  }

  public hasReset(): boolean {
    return this.hasFlag(JKFlipFlopElm.FLAG_RESET);
  }

  public positiveEdgeTriggered(): boolean {
    return this.hasFlag(JKFlipFlopElm.FLAG_POSITIVE_EDGE);
  }

  public invertReset(): boolean {
    return this.hasFlag(JKFlipFlopElm.FLAG_INVERT_RESET);
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 3;
    this.pins = Array<ChipPin>(this.getPostCount());
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "J");
    this.pins[1] = new ChipPin(1, ChipElm.SIDE_W, "");
    this.pins[1].clock = true;
    this.pins[1].bubble = !this.positiveEdgeTriggered();
    this.pins[2] = new ChipPin(2, ChipElm.SIDE_W, "K");
    this.pins[3] = new ChipPin(0, ChipElm.SIDE_E, "Q");
    this.pins[3].output = true;
    this.pins[3].state = true;
    this.pins[4] = new ChipPin(2, ChipElm.SIDE_E, "Q");
    this.pins[4].output = true;
    this.pins[4].lineOver = true;
    if (this.hasReset()) {
      this.pins[5] = new ChipPin(1, ChipElm.SIDE_E, "R");
      this.pins[5].bubble = this.invertReset();
    }
  }

  public override getPostCount(): number {
    return 5 + (this.hasReset() ? 1 : 0);
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override getChipName(): string {
    return "JK flip-flop";
  }

  public override getDumpType(): number {
    return 156;
  }

  public override execute(): void {
    if (this.justLoaded) {
      this.justLoaded = false;
      return;
    }
    const clock = this.pins[1].value;
    const transition = this.positiveEdgeTriggered()
      ? clock && !this.lastClock
      : !clock && this.lastClock;
    if (transition) {
      let q = this.pins[3].value;
      if (this.pins[0].value) {
        q = this.pins[2].value ? !q : true;
      } else if (this.pins[2].value) {
        q = false;
      }
      this.writeOutput(3, q);
    }
    this.lastClock = clock;
    if (
      this.hasReset() &&
      this.pins[5].value !== this.invertReset()
    ) {
      this.writeOutput(3, false);
    }
    this.writeOutput(4, !this.pins[3].value);
  }
}
