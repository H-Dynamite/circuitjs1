import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Second-generation current conveyor (CCII+/CCII-) model. */
export class CC2Elm extends ChipElm {
  public gain = 1;

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
      const gain = Number(tokens.nextToken());
      if (Number.isFinite(gain)) this.gain = gain;
    }
  }

  public override setupPins(): void {
    this.sizeX = 2;
    this.sizeY = 3;
    this.pins = [
      new ChipPin(0, ChipElm.SIDE_W, "X"),
      new ChipPin(2, ChipElm.SIDE_W, "Y"),
      new ChipPin(1, ChipElm.SIDE_E, "Z")
    ];
    this.pins[0].output = true;
  }

  public override getChipName(): string {
    return "CC2";
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getVoltageSourceCount(): number {
    return 1;
  }

  public override getDumpType(): number {
    return 179;
  }

  public override dump(): string {
    return `${super.dump()} ${this.gain}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ga", this.gain);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.gain = xml.parseDoubleAttr("ga", this.gain);
  }

  public override stamp(): void {
    const source = this.pins[0].voltSource;
    if (source === null) throw new Error("CC2 output source is unassigned");
    CircuitElm.sim.stampVoltageSource(
      CircuitNode.ground,
      this.nodes[0],
      source
    );
    CircuitElm.sim.stampVCVS(
      CircuitNode.ground,
      this.nodes[1],
      1,
      source
    );
    CircuitElm.sim.stampCCCS(
      CircuitNode.ground,
      this.nodes[2],
      source,
      this.gain
    );
  }

  public override calculateCurrent(): void {
    this.pins[2].current = this.pins[0].current * this.gain;
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }
}
