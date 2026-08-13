import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Parallel-in/serial-out shift register with serial fill input. */
export class PisoShiftElm extends ChipElm {
  public static readonly FLAG_NEW_BEHAVIOR = 2;
  public data: boolean[] = [];
  public dataIndex = 0;
  public clockState = false;
  public loadState = false;
  public dataPinIndex = 4;

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
    flags = PisoShiftElm.FLAG_NEW_BEHAVIOR,
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags, tokenizer);
    if (x2 === x && y2 === y) {
      this.flags |= PisoShiftElm.FLAG_NEW_BEHAVIOR;
    }
    this.data = Array<boolean>(this.bits || 8).fill(false);
    this.setupPins();
  }

  public hasNewBehavior(): boolean {
    return this.hasFlag(PisoShiftElm.FLAG_NEW_BEHAVIOR);
  }

  public override needsBits(): boolean {
    return true;
  }

  public override defaultBitCount(): number {
    return 8;
  }

  public override setupPins(): void {
    const bits = this.bits || 8;
    this.dataPinIndex = this.hasNewBehavior() ? 4 : 3;
    this.sizeX = bits + 2;
    this.sizeY = 3;
    this.pins = Array<ChipPin>(this.dataPinIndex + bits);
    this.pins[0] = new ChipPin(1, ChipElm.SIDE_W, "LD");
    this.pins[1] = new ChipPin(2, ChipElm.SIDE_W, "");
    this.pins[1].clock = true;
    this.pins[2] = new ChipPin(
      1,
      ChipElm.SIDE_E,
      `Q${this.hasNewBehavior() ? bits - 1 : bits}`
    );
    this.pins[2].output = true;
    if (this.hasNewBehavior()) {
      this.pins[3] = new ChipPin(0, ChipElm.SIDE_W, "SER");
    }
    for (let bit = 0; bit < bits; bit += 1) {
      this.pins[this.dataPinIndex + bit] = new ChipPin(
        bits - bit,
        ChipElm.SIDE_N,
        `D${bits - bit - 1}`
      );
    }
    this.allocNodes();
  }

  public override getPostCount(): number {
    return (this.hasNewBehavior() ? 4 : 3) + (this.bits || 8);
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override getChipName(): string {
    return "PISO shift register";
  }

  public override getDumpType(): number {
    return 186;
  }

  public override reset(): void {
    super.reset();
    this.data = Array<boolean>(this.bits || 8).fill(false);
    this.dataIndex = 0;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(
      element,
      "dt",
      this.data.map((value) => (value ? "1" : "0")).join("")
    );
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.data = Array<boolean>(this.bits).fill(false);
    const state = xml.parseStringAttr("dt", null);
    if (state !== null) {
      for (let bit = 0; bit < this.bits; bit += 1) {
        this.data[bit] = state[bit] === "1";
      }
    }
  }

  public override execute(): void {
    const load = this.pins[0].value;
    if (load !== this.loadState) {
      this.loadState = load;
      if (load && this.data.length > 0) {
        for (let bit = 0; bit < this.data.length; bit += 1) {
          this.data[bit] =
            this.pins[this.dataPinIndex + bit].value;
        }
        this.dataIndex = this.hasNewBehavior() ? 0 : -1;
        if (this.hasNewBehavior()) {
          this.pins[2].value = this.data[0];
        }
      }
    }

    const clock = this.pins[1].value;
    if (clock !== this.clockState) {
      this.clockState = clock;
      if (clock && this.data.length > 0) {
        if (this.dataIndex >= 0 && this.hasNewBehavior()) {
          this.data[this.dataIndex] = this.pins[3].value;
        }
        this.dataIndex = (this.dataIndex + 1) % this.data.length;
        this.pins[2].value = this.data[this.dataIndex];
      }
    }
  }
}
