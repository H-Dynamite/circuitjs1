import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Lossless connection between a multi-bit bus and individual wires. */
export class BusSplitterElm extends ChipElm {
  public currents: number[] = [];

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
    this.setupPins();
    this.allocNodes();
  }

  public override needsBits(): boolean {
    return true;
  }

  public override setupPins(): void {
    const bits = this.bits || 4;
    this.sizeX = 2;
    this.sizeY = bits;
    this.currents = Array(bits).fill(0);
    this.pins = Array<ChipPin>(bits * 2);
    for (let index = 0; index < bits; index += 1) {
      const bus = new ChipPin(0, ChipElm.SIDE_W, "Bus");
      bus.busWidth = bits;
      bus.busZ = index;
      this.pins[index] = bus;
      this.pins[index + bits] = new ChipPin(
        bits - 1 - index,
        ChipElm.SIDE_E,
        String(index)
      );
    }
  }

  public override getChipName(): string {
    return "Bus Splitter";
  }

  public override getPostCount(): number {
    return (this.bits || 4) * 2;
  }

  public override getBusWidth(): number {
    return this.bits || 4;
  }

  public override getVoltageSourceCount(): number {
    return 0;
  }

  public override getDumpType(): number {
    return 433;
  }

  public override getXmlDumpType(): string {
    return "bs";
  }

  public override getConnection(first: number, second: number): boolean {
    return Math.abs(first - second) === this.bits;
  }

  public override isWireEquivalent(): boolean {
    return true;
  }

  public override isRemovableWire(): boolean {
    return true;
  }

  public override getConnectedPost(index: number): Point {
    return this.getPost(
      index < this.bits ? index + this.bits : index - this.bits
    );
  }

  public override getCurrentIntoNode(index: number): number {
    return index < this.bits
      ? -this.currents[index]
      : this.currents[index - this.bits];
  }

  public override setWireCurrent(bit: number, current: number): void {
    this.currents[bit] = current;
    this.pins[bit + this.bits].current = current;
    this.pins[0].current = -this.currents.reduce(
      (sum, value) => sum + value,
      0
    );
  }
}
