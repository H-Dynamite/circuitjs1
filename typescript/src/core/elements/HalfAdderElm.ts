import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Two-input half adder, matching HalfAdderElm.java pin ordering. */
export class HalfAdderElm extends ChipElm {
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
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags, tokenizer);
    this.setupPins();
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = [
      new ChipPin(0, ChipElm.SIDE_E, "S"),
      new ChipPin(1, ChipElm.SIDE_E, "C"),
      new ChipPin(0, ChipElm.SIDE_W, "A"),
      new ChipPin(1, ChipElm.SIDE_W, "B")
    ];
    this.pins[0].output = true;
    this.pins[1].output = true;
    this.allocNodes();
  }

  public override getPostCount(): number {
    return 4;
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override getChipName(): string {
    return "Half Adder";
  }

  public override getDumpType(): number {
    return 195;
  }

  public override execute(): void {
    this.pins[0].value = this.pins[2].value !== this.pins[3].value;
    this.pins[1].value = this.pins[2].value && this.pins[3].value;
  }
}
