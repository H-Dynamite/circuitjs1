import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";

/** Electrical/topology port of WireElm.java. */
export class WireElm extends CircuitElm {
  public static readonly FLAG_SHOWCURRENT = 1;
  public static readonly FLAG_SHOWVOLTAGE = 2;
  public static readonly FLAG_SHOW_BUS_VALUE = 4;
  public static readonly FLAG_SHOW_BUS_VALUE_HEX = 8;

  public busWidth = 1;
  public currents: number[] | null = null;

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
    _tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    this.allocNodes();
  }

  public override getPostCount(): number {
    return this.busWidth * 2;
  }

  public override getBusWidth(): number {
    return this.busWidth;
  }

  public setBusWidth(width: number): void {
    if (!Number.isInteger(width) || width < 1) {
      throw new RangeError("Bus width must be a positive integer");
    }
    this.busWidth = width;
    this.currents = width > 1 ? Array<number>(width).fill(0) : null;
    this.allocNodes();
  }

  public override getPost(index: number): Point {
    if (this.busWidth === 1) {
      return index === 0 ? this.point1 : this.point2;
    }
    return index < this.busWidth
      ? new Point(this.point1.x, this.point1.y, index)
      : new Point(
          this.point2.x,
          this.point2.y,
          index - this.busWidth
        );
  }

  public override getPostWidth(_index: number): number {
    return this.busWidth;
  }

  public override getConnection(first: number, second: number): boolean {
    return (
      this.busWidth === 1 ||
      Math.abs(first - second) === this.busWidth
    );
  }

  public override getConnectedPost(index = 0): Point {
    if (this.busWidth === 1) {
      return index === 0 ? this.point2 : this.point1;
    }
    return index < this.busWidth
      ? new Point(this.point2.x, this.point2.y, index)
      : new Point(
          this.point1.x,
          this.point1.y,
          index - this.busWidth
        );
  }

  public getBusValue(): number {
    let value = 0;
    for (let bit = 0; bit < this.busWidth; bit += 1) {
      if (this.volts[bit] > 2.5) {
        value |= 1 << bit;
      }
    }
    return value;
  }

  public mustShowCurrent(): boolean {
    return this.hasFlag(WireElm.FLAG_SHOWCURRENT);
  }

  public mustShowVoltage(): boolean {
    return this.hasFlag(WireElm.FLAG_SHOWVOLTAGE);
  }

  public mustShowBusValue(): boolean {
    return this.hasFlag(WireElm.FLAG_SHOW_BUS_VALUE);
  }

  public mustShowBusValueHex(): boolean {
    return this.hasFlag(WireElm.FLAG_SHOW_BUS_VALUE_HEX);
  }

  public override getDumpType(): number {
    return "w".charCodeAt(0);
  }

  public override getPower(): number {
    return 0;
  }

  public override getVoltageDiff(): number {
    return this.volts[0];
  }

  public override isWireEquivalent(): boolean {
    return true;
  }

  public override isRemovableWire(): boolean {
    return true;
  }

  public override setWireCurrent(bit: number, current: number): void {
    if (this.currents === null) {
      this.current = current;
    } else {
      this.currents[bit] = current;
    }
  }

  public override getCurrent(): number {
    if (this.currents === null) {
      return this.current;
    }
    return this.currents.reduce((sum, current) => sum + current, 0);
  }

  public override getCurrentIntoNode(index: number): number {
    if (this.currents !== null) {
      return index < this.busWidth
        ? -this.currents[index]
        : this.currents[index - this.busWidth];
    }
    return index === 0 ? -this.current : this.current;
  }
}
