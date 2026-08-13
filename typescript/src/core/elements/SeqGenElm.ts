import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Clocked arbitrary bit-sequence generator. */
export class SeqGenElm extends ChipElm {
  public static readonly FLAG_NEW_VERSION = 2;
  public static readonly FLAG_PLAY_ONCE = 4;
  public static readonly FLAG_HAS_RESET = 8;

  public bitPosition = 0;
  public bitCount = 8;
  public data: number[] = [0];
  public clockState = false;

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
    flags = SeqGenElm.FLAG_NEW_VERSION | SeqGenElm.FLAG_HAS_RESET,
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags, tokenizer);
    if (x === x2 && y === y2) {
      this.flags |=
        SeqGenElm.FLAG_NEW_VERSION | SeqGenElm.FLAG_HAS_RESET;
    }
    if (tokenizer.hasMoreTokens()) {
      if (!this.hasFlag(SeqGenElm.FLAG_NEW_VERSION)) {
        this.flags |= SeqGenElm.FLAG_NEW_VERSION;
        const oldData = Number.parseInt(tokenizer.nextToken(), 10) || 0;
        let reversed = 0;
        for (let bit = 0; bit < 8; bit += 1) {
          if ((oldData & (1 << bit)) !== 0) {
            reversed |= 1 << (7 - bit);
          }
        }
        this.bitCount = 8;
        this.data = [reversed];
      } else {
        this.bitCount =
          Number.parseInt(tokenizer.nextToken(), 10) || 0;
        this.data = [];
        const wordCount = Math.ceil(this.bitCount / 32);
        for (
          let index = 0;
          index < wordCount && tokenizer.hasMoreTokens();
          index += 1
        ) {
          this.data.push(
            Number.parseInt(tokenizer.nextToken(), 10) || 0
          );
        }
      }
    }
    this.bitCount = Math.min(this.bitCount, this.data.length * 32);
    this.setupPins();
  }

  public hasPlayOnce(): boolean {
    return this.hasFlag(SeqGenElm.FLAG_PLAY_ONCE);
  }

  public hasReset(): boolean {
    return this.hasFlag(SeqGenElm.FLAG_HAS_RESET);
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = Array<ChipPin>(this.hasReset() ? 3 : 2);
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "");
    this.pins[0].clock = true;
    this.pins[1] = new ChipPin(1, ChipElm.SIDE_E, "Q");
    this.pins[1].output = true;
    if (this.hasReset()) {
      this.pins[2] = new ChipPin(1, ChipElm.SIDE_W, "R");
    }
    this.allocNodes();
  }

  public override getPostCount(): number {
    return this.hasReset() ? 3 : 2;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override getDumpType(): number {
    return 188;
  }

  public override getChipName(): string {
    return "sequence generator";
  }

  public override getVoltageDiff(): number {
    return this.volts[1];
  }

  public override reset(): void {
    super.reset();
    this.bitPosition = 0;
    this.clockState = false;
  }

  public nextBit(): void {
    if (this.data.length === 0 || this.bitCount === 0) {
      this.pins[1].value = false;
      return;
    }
    if (this.bitPosition >= this.bitCount) {
      if (this.hasPlayOnce()) {
        this.pins[1].value = false;
        return;
      }
      this.bitPosition = 0;
    }
    this.pins[1].value =
      (this.data[Math.floor(this.bitPosition / 32)] &
        (1 << (this.bitPosition % 32))) !==
      0;
    this.bitPosition += 1;
  }

  public override execute(): void {
    if (this.hasReset() && this.pins[2].value) {
      this.bitPosition = 0;
      this.clockState = this.pins[0].value;
      this.nextBit();
      return;
    }
    if (this.pins[0].value !== this.clockState) {
      this.clockState = this.pins[0].value;
      if (this.clockState) this.nextBit();
    }
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.bitCount}` +
      (this.data.length > 0 ? ` ${this.data.join(" ")}` : "")
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "bc", this.bitCount);
    XMLSerializer.dumpAttr(element, "dt", this.data.join(" "));
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.bitCount = xml.parseIntAttr("bc", this.bitCount);
    const rawData = xml.parseStringAttr("dt", null);
    if (rawData !== null) {
      this.data = rawData
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((value) => Number.parseInt(value, 10) || 0);
    }
    this.bitCount = Math.min(this.bitCount, this.data.length * 32);
  }
}
