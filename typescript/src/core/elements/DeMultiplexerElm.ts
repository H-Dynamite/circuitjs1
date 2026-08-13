import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Configurable digital demultiplexer ported from DeMultiplexerElm.java. */
export class DeMultiplexerElm extends ChipElm {
  public static readonly FLAG_BUS_SELECT = 1 << 3;
  public static readonly OUTPUT_MODE_INDIVIDUAL = 0;
  public static readonly OUTPUT_MODE_BUS_BIT = 1;
  public static readonly OUTPUT_MODE_BUS_BUS = 2;

  public selectBitCount = 2;
  public outputCount = 4;
  public outputMode = DeMultiplexerElm.OUTPUT_MODE_INDIVIDUAL;
  public dataBusWidth = 4;
  public inputPin = 0;
  public selectPin = 0;
  public outputPin = 0;

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
    const tokens = tokenizer ?? new StringTokenizer("");
    super(x, y, x2, y2, flags, tokens);
    if (tokens.hasMoreTokens()) {
      const count = Number.parseInt(tokens.nextToken(), 10);
      if (Number.isFinite(count)) this.selectBitCount = count;
    }
    this.setupPins();
  }

  public busSelect(): boolean {
    return this.hasFlag(DeMultiplexerElm.FLAG_BUS_SELECT);
  }

  public override setupPins(): void {
    const selectBits = this.selectBitCount || 2;
    this.outputCount = 1 << selectBits;
    if (
      this.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BUS
    ) {
      const dataWidth = this.dataBusWidth || 4;
      this.sizeX = selectBits + 1;
      this.sizeY = this.outputCount + 1;
      this.pins = Array<ChipPin>(
        dataWidth + selectBits + this.outputCount * dataWidth
      );
      this.inputPin = 0;
      for (let bit = 0; bit < dataWidth; bit += 1) {
        const pin = new ChipPin(0, ChipElm.SIDE_W, "Q");
        pin.busWidth = dataWidth;
        pin.busZ = bit;
        this.pins[bit] = pin;
      }
      this.selectPin = dataWidth;
      this.createSelectPins(selectBits);
      this.outputPin = this.selectPin + selectBits;
      for (let group = 0; group < this.outputCount; group += 1) {
        for (let bit = 0; bit < dataWidth; bit += 1) {
          const pin = new ChipPin(group, ChipElm.SIDE_E, `Q${group}`);
          pin.output = true;
          pin.busWidth = dataWidth;
          pin.busZ = bit;
          this.pins[this.outputPin + group * dataWidth + bit] = pin;
        }
      }
    } else {
      this.sizeX = selectBits + 1;
      this.sizeY =
        this.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BIT
          ? 3
          : this.outputCount + 1;
      this.pins = Array<ChipPin>(
        1 + selectBits + this.outputCount
      );
      if (
        this.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BIT
      ) {
        this.inputPin = 0;
        this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "Q");
        this.selectPin = 1;
        this.createSelectPins(selectBits);
        this.outputPin = this.selectPin + selectBits;
        for (let bit = 0; bit < this.outputCount; bit += 1) {
          const pin = new ChipPin(1, ChipElm.SIDE_E, "Q");
          pin.output = true;
          pin.busWidth = this.outputCount;
          pin.busZ = bit;
          this.pins[this.outputPin + bit] = pin;
        }
      } else {
        this.outputPin = 0;
        for (let index = 0; index < this.outputCount; index += 1) {
          this.pins[index] = new ChipPin(
            index,
            ChipElm.SIDE_E,
            `Q${index}`
          );
          this.pins[index].output = true;
        }
        this.selectPin = this.outputCount;
        this.createSelectPins(selectBits);
        this.inputPin = this.outputCount + selectBits;
        this.pins[this.inputPin] = new ChipPin(
          0,
          ChipElm.SIDE_W,
          "Q"
        );
      }
    }
    this.allocNodes();
  }

  private createSelectPins(count: number): void {
    for (let index = 0; index < count; index += 1) {
      const pin = new ChipPin(
        this.busSelect() ? 0 : index + 1,
        ChipElm.SIDE_S,
        this.busSelect() ? "S" : `S${index}`
      );
      if (this.busSelect()) {
        pin.busWidth = count;
        pin.busZ = index;
      }
      this.pins[this.selectPin + index] = pin;
    }
  }

  private readSelectValue(): number {
    let value = 0;
    for (let index = 0; index < this.selectBitCount; index += 1) {
      if (this.pins[this.selectPin + index].value) {
        value |= 1 << index;
      }
    }
    return value;
  }

  public override execute(): void {
    const selected = this.readSelectValue();
    if (
      this.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BUS
    ) {
      for (let group = 0; group < this.outputCount; group += 1) {
        for (let bit = 0; bit < this.dataBusWidth; bit += 1) {
          this.pins[
            this.outputPin + group * this.dataBusWidth + bit
          ].value = false;
        }
      }
      for (let bit = 0; bit < this.dataBusWidth; bit += 1) {
        this.pins[
          this.outputPin + selected * this.dataBusWidth + bit
        ].value = this.pins[this.inputPin + bit].value;
      }
    } else {
      for (let index = 0; index < this.outputCount; index += 1) {
        this.pins[this.outputPin + index].value = false;
      }
      this.pins[this.outputPin + selected].value =
        this.pins[this.inputPin].value;
    }
  }

  public override getPostCount(): number {
    const selectBits = this.selectBitCount || 2;
    const outputs = this.outputCount || 1 << selectBits;
    if (
      this.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BUS
    ) {
      const width = this.dataBusWidth || 4;
      return width + selectBits + outputs * width;
    }
    return 1 + selectBits + outputs;
  }

  public override getVoltageSourceCount(): number {
    if (
      this.outputMode === DeMultiplexerElm.OUTPUT_MODE_BUS_BUS
    ) {
      return this.outputCount * this.dataBusWidth;
    }
    return this.outputCount;
  }

  public override getDumpType(): number {
    return 185;
  }

  public override getXmlDumpType(): string {
    return "dmux";
  }

  public override getChipName(): string {
    return "Demultiplexer";
  }

  public override dump(): string {
    return `${super.dump()} ${this.selectBitCount}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "se", this.selectBitCount);
    if (this.outputMode !== 0) {
      XMLSerializer.dumpAttr(element, "om", this.outputMode);
    }
    if (this.dataBusWidth !== 4) {
      XMLSerializer.dumpAttr(element, "dw", this.dataBusWidth);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.selectBitCount = xml.parseIntAttr("se", this.selectBitCount);
    this.outputMode = xml.parseIntAttr("om", 0);
    this.dataBusWidth = xml.parseIntAttr("dw", 4);
    this.setupPins();
  }
}
