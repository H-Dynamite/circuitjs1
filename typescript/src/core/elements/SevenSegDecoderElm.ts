import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Four-bit hexadecimal to seven-segment decoder. */
export class SevenSegDecoderElm extends ChipElm {
  public static readonly FLAG_ENABLE = 1 << 1;
  public static readonly FLAG_BLANK_F = 1 << 2;
  public static readonly symbols: boolean[][] = [
    [true, true, true, true, true, true, false],
    [false, true, true, false, false, false, false],
    [true, true, false, true, true, false, true],
    [true, true, true, true, false, false, true],
    [false, true, true, false, false, true, true],
    [true, false, true, true, false, true, true],
    [true, false, true, true, true, true, true],
    [true, true, true, false, false, false, false],
    [true, true, true, true, true, true, true],
    [true, true, true, false, false, true, true],
    [true, true, true, false, true, true, true],
    [false, false, true, true, true, true, true],
    [true, false, false, true, true, true, false],
    [false, true, true, true, true, false, true],
    [true, false, false, true, true, true, true],
    [true, false, false, false, true, true, true]
  ];
  public segmentType = 0;

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
      this.segmentType = Number.parseInt(tokens.nextToken(), 10) || 0;
    }
    this.setupPins();
    this.allocNodes();
  }

  public getSegmentCount(): number {
    return this.segmentType === 1 ? 14 : this.segmentType === 2 ? 16 : 7;
  }

  public hasBlank(): boolean {
    return this.hasFlag(SevenSegDecoderElm.FLAG_ENABLE);
  }

  public override setupPins(): void {
    const segmentCount = this.getSegmentCount();
    this.bits = 4;
    this.sizeX = 3;
    this.sizeY = Math.max(segmentCount, 4 + (this.hasBlank() ? 1 : 0));
    this.pins = Array<ChipPin>(this.getPostCount());
    this.makeBitPins(
      4,
      0,
      ChipElm.SIDE_W,
      segmentCount,
      "I",
      false,
      false,
      true
    );
    for (let index = 0; index < segmentCount; index += 1) {
      this.pins[index] = new ChipPin(
        index,
        ChipElm.SIDE_E,
        String.fromCharCode(97 + index)
      );
      this.pins[index].output = true;
    }
    if (this.hasBlank()) {
      this.pins[segmentCount + 4] = new ChipPin(
        4,
        ChipElm.SIDE_W,
        "BI"
      );
      this.pins[segmentCount + 4].bubble = true;
    }
  }

  public override execute(): void {
    const segmentCount = this.getSegmentCount();
    let input = 0;
    for (let index = 0; index < 4; index += 1) {
      if (this.pins[segmentCount + index].value) {
        input |= 1 << (3 - index);
      }
    }
    const enabled =
      !this.hasBlank() || this.pins[segmentCount + 4].value;
    const pattern =
      segmentCount === 7
        ? SevenSegDecoderElm.symbols[input]
        : SevenSegDecoderElm.symbols[input].concat(
            Array(segmentCount - 7).fill(false)
          );
    for (let index = 0; index < segmentCount; index += 1) {
      this.pins[index].value =
        enabled &&
        !(input === 15 && this.hasFlag(SevenSegDecoderElm.FLAG_BLANK_F)) &&
        pattern[index];
    }
  }

  public override getPostCount(): number {
    return this.getSegmentCount() + 4 + (this.hasBlank() ? 1 : 0);
  }

  public override getVoltageSourceCount(): number {
    return this.getSegmentCount();
  }

  public override getDumpType(): number {
    return 197;
  }

  public override getChipName(): string {
    return `${this.getSegmentCount()}-Segment Decoder`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "sgt", this.segmentType);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.segmentType = xml.parseIntAttr("sgt", this.segmentType);
    this.setupPins();
    this.allocNodes();
  }
}
