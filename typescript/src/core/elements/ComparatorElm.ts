import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Ideal three-terminal comparator with a 0/high-voltage output. */
export class ComparatorElm extends ChipElm {
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
      new ChipPin(0, ChipElm.SIDE_W, "−"),
      new ChipPin(1, ChipElm.SIDE_W, "+"),
      new ChipPin(0, ChipElm.SIDE_E, "Q")
    ];
    this.pins[2].output = true;
    this.allocNodes();
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override getChipName(): string {
    return "Comparator";
  }

  public override getDumpType(): number {
    return 401;
  }

  public override execute(): void {
    this.pins[2].value = this.volts[1] >= this.volts[0];
  }
}
