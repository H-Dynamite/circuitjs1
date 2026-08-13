import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

export class ChipPin {
  public post = new Point();
  public stub = new Point();
  public textloc = new Point();
  public output = false;
  public value = false;
  public state = false;
  public lineOver = false;
  public bubble = false;
  public clock = false;
  public current = 0;
  public voltSource: VoltageSource | null = null;
  public busWidth = 1;
  public busZ = 0;
  public readonly originalSide: number;

  public constructor(
    public pos: number,
    public side: number,
    public text: string
  ) {
    this.originalSide = side;
  }
}

/** Shared pin geometry and digital-output behavior from ChipElm.java. */
export abstract class ChipElm extends CircuitElm {
  public static readonly FLAG_SMALL = 1;
  public static readonly FLAG_FLIP_X = 1 << 10;
  public static readonly FLAG_FLIP_Y = 1 << 11;
  public static readonly FLAG_FLIP_XY = 1 << 12;
  public static readonly FLAG_CUSTOM_VOLTAGE = 1 << 13;
  public static readonly BIT_ORDER_DEFAULT = 0;
  public static readonly BIT_ORDER_LSB_FIRST = 1;
  public static readonly BIT_ORDER_BUS = 2;
  public static readonly SIDE_N = 0;
  public static readonly SIDE_S = 1;
  public static readonly SIDE_W = 2;
  public static readonly SIDE_E = 3;

  public csize = 2;
  public cspc = 16;
  public cspc2 = 32;
  public bits = 0;
  public bitOrder = ChipElm.BIT_ORDER_DEFAULT;
  public highVoltage = 5;
  public pins: ChipPin[] = [];
  public sizeX = 2;
  public sizeY = 2;
  public lastClock = false;
  public bodyLeft = 0;
  public bodyTop = 0;
  public bodyRight = 0;
  public bodyBottom = 0;

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
    super(x, y, x2, y2, flags);
    this.noDiagonal = true;
    if (this.needsBits()) {
      this.bits = this.defaultBitCount();
      if (tokenizer?.hasMoreTokens()) {
        const bits = Number.parseInt(tokenizer.nextToken(), 10);
        if (Number.isFinite(bits)) this.bits = bits;
      }
    }
    if (
      this.hasFlag(ChipElm.FLAG_CUSTOM_VOLTAGE) &&
      tokenizer?.hasMoreTokens()
    ) {
      const voltage = Number(tokenizer.nextToken());
      if (Number.isFinite(voltage)) this.highVoltage = voltage;
    }
    this.setupPins();
    this.setSize(this.hasFlag(ChipElm.FLAG_SMALL) ? 1 : 2);
    this.allocNodes();
    for (let index = 0; index < this.getPostCount(); index += 1) {
      const pin = this.pins[index];
      if (pin?.state && tokenizer?.hasMoreTokens()) {
        const voltage = Number(tokenizer.nextToken());
        if (Number.isFinite(voltage)) {
          this.volts[index] = voltage;
          pin.value = voltage > this.getThreshold();
        }
      }
    }
  }

  public abstract setupPins(): void;

  public abstract getChipName(): string;

  public needsBits(): boolean {
    return false;
  }

  public defaultBitCount(): number {
    return 4;
  }

  public useBus(): boolean {
    return this.bitOrder === ChipElm.BIT_ORDER_BUS;
  }

  public makeBitPins(
    count: number,
    pos: number,
    side: number,
    offset: number,
    name: string,
    output: boolean,
    state: boolean,
    reversed: boolean
  ): void {
    for (let index = 0; index < count; index += 1) {
      const pinIndex = reversed
        ? offset + count - 1 - index
        : offset + index;
      let pin: ChipPin;
      if (this.useBus()) {
        pin = new ChipPin(pos, side, name);
        pin.busWidth = count;
        pin.busZ = index;
      } else if (this.bitOrder === ChipElm.BIT_ORDER_LSB_FIRST) {
        pin = new ChipPin(pos + index, side, `${name}${index}`);
      } else {
        pin = new ChipPin(
          pos + (count - 1 - index),
          side,
          `${name}${index}`
        );
      }
      pin.output = output;
      pin.state = state;
      this.pins[pinIndex] = pin;
    }
  }

  public getThreshold(): number {
    return this.highVoltage / 2;
  }

  protected restoreStatePinValues(): void {
    for (let index = 0; index < this.getPostCount(); index += 1) {
      const pin = this.pins[index];
      if (pin?.state) {
        pin.value = this.volts[index] > this.getThreshold();
      }
    }
  }

  public setSize(size: number): void {
    this.csize = size;
    this.cspc = 8 * size;
    this.cspc2 = this.cspc * 2;
    this.flags &= ~ChipElm.FLAG_SMALL;
    if (size === 1) this.flags |= ChipElm.FLAG_SMALL;
  }

  public override setPoints(): void {
    super.setPoints();
    const x0 = this.x + this.cspc2;
    const y0 = this.y;
    const flipXY = this.hasFlag(ChipElm.FLAG_FLIP_XY);
    const flipX = this.hasFlag(ChipElm.FLAG_FLIP_X);
    const flipY = this.hasFlag(ChipElm.FLAG_FLIP_Y);
    const transformedSizeX = flipXY ? this.sizeY : this.sizeX;
    const transformedSizeY = flipXY ? this.sizeX : this.sizeY;
    const width = transformedSizeX * this.cspc2;
    const height = transformedSizeY * this.cspc2;
    this.bodyLeft = x0 - this.cspc;
    this.bodyTop = y0 - this.cspc;
    this.bodyRight = this.bodyLeft + width;
    this.bodyBottom = this.bodyTop + height;

    for (const pin of this.pins) {
      const sideFlipXY = [
        ChipElm.SIDE_W,
        ChipElm.SIDE_E,
        ChipElm.SIDE_N,
        ChipElm.SIDE_S
      ];
      pin.side = flipXY
        ? sideFlipXY[pin.originalSide]
        : pin.originalSide;
      let px = x0;
      let py = y0;
      let dx = 0;
      let dy = 0;
      let outwardX = 0;
      let outwardY = 0;
      let offsetX = 0;
      let offsetY = 0;
      switch (pin.side) {
        case ChipElm.SIDE_N:
          dx = 1;
          outwardY = -1;
          break;
        case ChipElm.SIDE_S:
          dx = 1;
          outwardY = 1;
          offsetY = height - this.cspc2;
          break;
        case ChipElm.SIDE_W:
          dy = 1;
          outwardX = -1;
          break;
        case ChipElm.SIDE_E:
          dy = 1;
          outwardX = 1;
          offsetX = width - this.cspc2;
          break;
      }
      if (flipX) {
        dx = -dx;
        outwardX = -outwardX;
        px += this.cspc2 * (transformedSizeX - 1);
        offsetX = -offsetX;
      }
      if (flipY) {
        dy = -dy;
        outwardY = -outwardY;
        py += this.cspc2 * (transformedSizeY - 1);
        offsetY = -offsetY;
      }
      const anchorX =
        px + this.cspc2 * dx * pin.pos + offsetX;
      const anchorY =
        py + this.cspc2 * dy * pin.pos + offsetY;
      pin.textloc = new Point(anchorX, anchorY);
      pin.stub = new Point(
        anchorX + outwardX * this.cspc,
        anchorY + outwardY * this.cspc
      );
      pin.post = new Point(
        anchorX + outwardX * this.cspc2,
        anchorY + outwardY * this.cspc2,
        pin.busZ
      );
    }
  }

  public override getPost(index: number): Point {
    return this.pins[index]?.post ?? this.point1;
  }

  public override getPostWidth(index: number): number {
    return this.pins[index]?.busWidth ?? 1;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    for (const pin of this.pins) {
      if (!pin.output) continue;
      if (index === 0) {
        pin.voltSource = source;
        const nodeIndex = this.pins.indexOf(pin);
        source.setNodes(CircuitNode.ground, this.nodes[nodeIndex]);
        return;
      }
      index -= 1;
    }
    throw new Error(`${this.getChipName()} output source index is invalid`);
  }

  public override stamp(): void {
    for (let index = 0; index < this.pins.length; index += 1) {
      const pin = this.pins[index];
      if (!pin.output) continue;
      if (pin.voltSource === null) {
        throw new Error(`${this.getChipName()} output is unassigned`);
      }
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[index],
        pin.voltSource
      );
    }
  }

  public execute(): void {}

  public override doStep(): void {
    for (let index = 0; index < this.pins.length; index += 1) {
      if (!this.pins[index].output) {
        this.pins[index].value =
          this.volts[index] > this.getThreshold();
      }
    }
    this.execute();
    for (let index = 0; index < this.pins.length; index += 1) {
      const pin = this.pins[index];
      if (!pin.output) continue;
      if (pin.voltSource === null) {
        throw new Error(`${this.getChipName()} output is unassigned`);
      }
      CircuitElm.sim.updateVoltageSource(
        CircuitNode.ground,
        this.nodes[index],
        pin.voltSource,
        pin.value ? this.highVoltage : 0
      );
    }
  }

  public writeOutput(index: number, value: boolean): void {
    if (!this.pins[index]?.output) {
      throw new Error(`${this.getChipName()} pin ${index} is not an output`);
    }
    this.pins[index].value = value;
  }

  public override reset(): void {
    for (let index = 0; index < this.pins.length; index += 1) {
      this.pins[index].value = false;
      this.pins[index].current = 0;
      this.volts[index] = 0;
    }
    this.lastClock = false;
  }

  public override dump(): string {
    if (this.highVoltage === 5) {
      this.flags &= ~ChipElm.FLAG_CUSTOM_VOLTAGE;
    } else {
      this.flags |= ChipElm.FLAG_CUSTOM_VOLTAGE;
    }
    const values: Array<string | number> = [super.dump()];
    if (this.needsBits()) values.push(this.bits);
    if (this.hasFlag(ChipElm.FLAG_CUSTOM_VOLTAGE)) {
      values.push(this.highVoltage);
    }
    for (let index = 0; index < this.pins.length; index += 1) {
      if (this.pins[index].state) values.push(this.volts[index]);
    }
    return values.join(" ");
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    if (this.bits > 0) XMLSerializer.dumpAttr(element, "bi", this.bits);
    if (this.bitOrder !== ChipElm.BIT_ORDER_DEFAULT) {
      XMLSerializer.dumpAttr(element, "bo", this.bitOrder);
    }
    if (this.highVoltage !== 5) {
      XMLSerializer.dumpAttr(element, "hv", this.highVoltage);
    }
    for (let index = 0; index < this.pins.length; index += 1) {
      if (this.pins[index].state && this.volts[index] !== 0) {
        XMLSerializer.dumpAttr(element, `v${index}`, this.volts[index]);
      }
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.bits = xml.parseIntAttr("bi", this.bits);
    this.bitOrder = xml.parseIntAttr("bo", this.bitOrder);
    this.highVoltage = xml.parseDoubleAttr("hv", this.highVoltage);
    this.setupPins();
    this.setSize(this.hasFlag(ChipElm.FLAG_SMALL) ? 1 : 2);
    this.allocNodes();
    for (let index = 0; index < this.pins.length; index += 1) {
      this.volts[index] = xml.parseDoubleAttr(`v${index}`, 0);
      this.pins[index].value =
        this.volts[index] > this.getThreshold();
    }
  }

  public override setCurrent(source: VoltageSource, current: number): void {
    for (const pin of this.pins) {
      if (pin.output && pin.voltSource === source) {
        pin.current = current;
      }
    }
  }

  public override getConnection(
    _first: number,
    _second: number
  ): boolean {
    return false;
  }

  public override hasGroundConnection(index: number): boolean {
    return this.pins[index]?.output ?? false;
  }

  public override getCurrentIntoNode(index: number): number {
    return this.pins[index]?.current ?? 0;
  }
}
