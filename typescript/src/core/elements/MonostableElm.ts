import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Rising-edge monostable with complementary outputs. */
export class MonostableElm extends ChipElm {
  public prevInputValue = false;
  public retriggerable = false;
  public triggered = false;
  public lastRisingEdge = 0;
  public delay = 0.01;

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
    if (tokenizer.hasMoreTokens()) {
      this.retriggerable = tokenizer.nextToken().toLowerCase() === "true";
    }
    if (tokenizer.hasMoreTokens()) {
      const delay = Number(tokenizer.nextToken());
      if (Number.isFinite(delay)) this.delay = delay;
    }
    this.setupPins();
    this.reset();
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 2;
    this.pins = [
      new ChipPin(0, ChipElm.SIDE_W, ""),
      new ChipPin(0, ChipElm.SIDE_E, "Q"),
      new ChipPin(1, ChipElm.SIDE_E, "Q")
    ];
    this.pins[0].clock = true;
    this.pins[1].output = true;
    this.pins[2].output = true;
    this.pins[2].lineOver = true;
    this.allocNodes();
  }

  public override reset(): void {
    super.reset();
    if (this.pins[2] !== undefined) this.pins[2].value = true;
    this.triggered = false;
    this.prevInputValue = false;
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override getChipName(): string {
    return "Monostable";
  }

  public override getDumpType(): number {
    return 194;
  }

  public override dump(): string {
    return `${super.dump()} ${this.retriggerable} ${this.delay}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "rt", this.retriggerable);
    XMLSerializer.dumpAttr(element, "dl", this.delay);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.retriggerable = xml.parseBooleanAttr(
      "rt",
      this.retriggerable
    );
    this.delay = xml.parseDoubleAttr("dl", this.delay);
    this.reset();
  }

  public override execute(): void {
    const input = this.pins[0].value;
    if (
      input &&
      input !== this.prevInputValue &&
      (this.retriggerable || !this.triggered)
    ) {
      this.lastRisingEdge = this.simulationTime();
      this.pins[1].value = true;
      this.pins[2].value = false;
      this.triggered = true;
    }
    if (
      this.triggered &&
      this.simulationTime() > this.lastRisingEdge + this.delay
    ) {
      this.pins[1].value = false;
      this.pins[2].value = true;
      this.triggered = false;
    }
    this.prevInputValue = input;
  }

  private simulationTime(): number {
    return CircuitElm.sim.t;
  }
}
