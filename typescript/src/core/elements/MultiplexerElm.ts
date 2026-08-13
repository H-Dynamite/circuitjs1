import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Configurable digital multiplexer, including bus modes. */
export class MultiplexerElm extends ChipElm {
  public static readonly FLAG_INVERTED_OUTPUT = 1 << 1;
  public static readonly FLAG_STROBE = 1 << 2;
  public static readonly FLAG_BUS_SELECT = 1 << 3;
  public static readonly INPUT_MODE_INDIVIDUAL = 0;
  public static readonly INPUT_MODE_BUS_BIT = 1;
  public static readonly INPUT_MODE_BUS_BUS = 2;

  public selectBitCount = 2;
  public outputCount = 4;
  public inputMode = MultiplexerElm.INPUT_MODE_INDIVIDUAL;
  public dataBusWidth = 4;
  public strobe = -1;
  public outputPin = 0;
  public selectPin = 0;

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
      this.selectBitCount =
        Number.parseInt(tokens.nextToken(), 10) || this.selectBitCount;
    }
    this.setupPins();
    this.allocNodes();
  }

  public busSelect(): boolean {
    return this.hasFlag(MultiplexerElm.FLAG_BUS_SELECT);
  }

  public override setupPins(): void {
    const selectBits = this.selectBitCount || 2;
    this.outputCount = 1 << selectBits;
    const inverted = this.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT);
    const hasStrobe = this.hasFlag(MultiplexerElm.FLAG_STROBE);

    if (this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BUS) {
      const inputPins = this.outputCount * this.dataBusWidth;
      const invertedPins = inverted ? this.dataBusWidth : 0;
      this.sizeX = selectBits + 1;
      this.sizeY = this.outputCount + 1;
      this.pins = Array<ChipPin>(
        inputPins +
          selectBits +
          this.dataBusWidth +
          invertedPins +
          (hasStrobe ? 1 : 0)
      );
      for (let group = 0; group < this.outputCount; group += 1) {
        for (let bit = 0; bit < this.dataBusWidth; bit += 1) {
          const pin = new ChipPin(group, ChipElm.SIDE_W, `I${group}`);
          pin.busWidth = this.dataBusWidth;
          pin.busZ = bit;
          this.pins[group * this.dataBusWidth + bit] = pin;
        }
      }
      this.selectPin = inputPins;
      this.createSelectPins(selectBits);
      this.outputPin = this.selectPin + selectBits;
      for (let bit = 0; bit < this.dataBusWidth; bit += 1) {
        const output = new ChipPin(0, ChipElm.SIDE_E, "Q");
        output.output = true;
        output.busWidth = this.dataBusWidth;
        output.busZ = bit;
        this.pins[this.outputPin + bit] = output;
        if (inverted) {
          const complement = new ChipPin(1, ChipElm.SIDE_E, "Q");
          complement.output = true;
          complement.lineOver = true;
          complement.busWidth = this.dataBusWidth;
          complement.busZ = bit;
          this.pins[this.outputPin + this.dataBusWidth + bit] = complement;
        }
      }
      this.strobe = hasStrobe ? this.pins.length - 1 : -1;
    } else {
      this.sizeX = selectBits + 1;
      this.sizeY =
        this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BIT
          ? 3
          : this.outputCount + 1;
      this.pins = Array<ChipPin>(
        this.outputCount + selectBits + 1 + (inverted ? 1 : 0) +
          (hasStrobe ? 1 : 0)
      );
      for (let index = 0; index < this.outputCount; index += 1) {
        const pin = new ChipPin(
          this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BIT ? 0 : index,
          ChipElm.SIDE_W,
          this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BIT
            ? "I"
            : `I${index}`
        );
        if (this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BIT) {
          pin.busWidth = this.outputCount;
          pin.busZ = index;
        }
        this.pins[index] = pin;
      }
      this.selectPin = this.outputCount;
      this.createSelectPins(selectBits);
      this.outputPin = this.selectPin + selectBits;
      this.pins[this.outputPin] = new ChipPin(0, ChipElm.SIDE_E, "Q");
      this.pins[this.outputPin].output = true;
      let next = this.outputPin + 1;
      if (inverted) {
        this.pins[next] = new ChipPin(1, ChipElm.SIDE_E, "Q");
        this.pins[next].output = true;
        this.pins[next].lineOver = true;
        this.pins[next].bubble = true;
        next += 1;
      }
      this.strobe = hasStrobe ? next : -1;
    }
    if (this.strobe >= 0) {
      this.pins[this.strobe] = new ChipPin(0, ChipElm.SIDE_S, "STR");
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
      if (this.pins[this.selectPin + index].value) value |= 1 << index;
    }
    return value;
  }

  public override execute(): void {
    const selected = this.readSelectValue();
    const disabled = this.strobe >= 0 && this.pins[this.strobe].value;
    if (this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BUS) {
      for (let bit = 0; bit < this.dataBusWidth; bit += 1) {
        const value =
          !disabled &&
          this.pins[selected * this.dataBusWidth + bit].value;
        this.pins[this.outputPin + bit].value = value;
        if (this.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT)) {
          this.pins[this.outputPin + this.dataBusWidth + bit].value =
            !value;
        }
      }
    } else {
      const value = !disabled && this.pins[selected].value;
      this.pins[this.outputPin].value = value;
      if (this.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT)) {
        this.pins[this.outputPin + 1].value = !value;
      }
    }
  }

  public override getPostCount(): number {
    const selectBits = this.selectBitCount || 2;
    const outputs = this.outputCount || 1 << selectBits;
    const inverted = this.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT);
    const strobe = this.hasFlag(MultiplexerElm.FLAG_STROBE) ? 1 : 0;
    if (this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BUS) {
      return (
        outputs * this.dataBusWidth +
        selectBits +
        this.dataBusWidth +
        (inverted ? this.dataBusWidth : 0) +
        strobe
      );
    }
    return outputs + selectBits + 1 + (inverted ? 1 : 0) + strobe;
  }

  public override getVoltageSourceCount(): number {
    if (this.inputMode === MultiplexerElm.INPUT_MODE_BUS_BUS) {
      return (
        this.dataBusWidth *
        (this.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT) ? 2 : 1)
      );
    }
    return this.hasFlag(MultiplexerElm.FLAG_INVERTED_OUTPUT) ? 2 : 1;
  }

  public override getDumpType(): number {
    return 184;
  }

  public override getXmlDumpType(): string {
    return "mux";
  }

  public override getChipName(): string {
    return "Multiplexer";
  }

  public override dump(): string {
    return `${super.dump()} ${this.selectBitCount}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "se", this.selectBitCount);
    if (this.inputMode !== 0) {
      XMLSerializer.dumpAttr(element, "im", this.inputMode);
    }
    if (this.dataBusWidth !== 4) {
      XMLSerializer.dumpAttr(element, "dw", this.dataBusWidth);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.selectBitCount = xml.parseIntAttr("se", this.selectBitCount);
    this.inputMode = xml.parseIntAttr("im", 0);
    this.dataBusWidth = xml.parseIntAttr("dw", 4);
    this.setupPins();
  }
}
