import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Serial-in/parallel-out shift register. */
export class SipoShiftElm extends ChipElm {
  public static readonly DATA_PIN_INDEX = 2;
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
    flags = 0,
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags, tokenizer);
    this.setupPins();
  }

  public override needsBits(): boolean {
    return true;
  }

  public override defaultBitCount(): number {
    return 8;
  }

  public override setupPins(): void {
    const bits = this.bits || 8;
    const previous = this.pins ?? [];
    this.sizeX = bits + 1;
    this.sizeY = 3;
    this.pins = Array<ChipPin>(2 + bits);
    this.pins[0] = new ChipPin(1, ChipElm.SIDE_W, "D");
    this.pins[1] = new ChipPin(2, ChipElm.SIDE_W, "");
    this.pins[1].clock = true;
    for (let bit = 0; bit < bits; bit += 1) {
      const pin = new ChipPin(bit + 1, ChipElm.SIDE_N, `Q${bit}`);
      pin.output = true;
      pin.value =
        previous[SipoShiftElm.DATA_PIN_INDEX + bit]?.value ?? false;
      this.pins[SipoShiftElm.DATA_PIN_INDEX + bit] = pin;
    }
    this.allocNodes();
  }

  public override getPostCount(): number {
    return 2 + (this.bits || 8);
  }

  public override getVoltageSourceCount(): number {
    return this.bits || 8;
  }

  public override getChipName(): string {
    return "SIPO shift register";
  }

  public override getDumpType(): number {
    return 189;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "dt", this.stateText());
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    const state = xml.parseStringAttr("dt", null);
    if (state !== null) {
      for (let bit = 0; bit < this.bits; bit += 1) {
        this.pins[SipoShiftElm.DATA_PIN_INDEX + bit].value =
          state[bit] === "1";
      }
    }
  }

  public override execute(): void {
    const clock = this.pins[1].value;
    if (clock !== this.clockState) {
      this.clockState = clock;
      if (clock) {
        for (let bit = this.bits - 1; bit > 0; bit -= 1) {
          this.pins[SipoShiftElm.DATA_PIN_INDEX + bit].value =
            this.pins[SipoShiftElm.DATA_PIN_INDEX + bit - 1].value;
        }
        this.pins[SipoShiftElm.DATA_PIN_INDEX].value =
          this.pins[0].value;
      }
    }
  }

  private stateText(): string {
    return Array.from(
      { length: this.bits },
      (_, bit) =>
        this.pins[SipoShiftElm.DATA_PIN_INDEX + bit].value ? "1" : "0"
    ).join("");
  }
}
