import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Electrically modeled row/column LED matrix. */
export class LEDArrayElm extends ChipElm {
  public diodeStates: boolean[] = [];
  public diodeCurrents: number[] = [];
  public brightness: number[] = [];

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
    this.sizeX = 8;
    this.sizeY = 8;
    if (tokens.hasMoreTokens()) {
      const width = Number.parseInt(tokens.nextToken(), 10);
      if (Number.isFinite(width)) this.sizeX = width;
    }
    if (tokens.hasMoreTokens()) {
      const height = Number.parseInt(tokens.nextToken(), 10);
      if (Number.isFinite(height)) this.sizeY = height;
    }
    this.setupPins();
  }

  public override setupPins(): void {
    const width = this.sizeX || 8;
    const height = this.sizeY || 8;
    this.pins = Array<ChipPin>(width + height);
    for (let column = 0; column < width; column += 1) {
      this.pins[column] = new ChipPin(
        column,
        ChipElm.SIDE_S,
        ""
      );
    }
    for (let row = 0; row < height; row += 1) {
      this.pins[width + row] = new ChipPin(row, ChipElm.SIDE_W, "");
    }
    this.brightness = Array(width * height).fill(0);
    this.allocNodes();
  }

  public override getChipName(): string {
    return "LED array";
  }

  public override getDumpType(): number {
    return 405;
  }

  public override getPostCount(): number {
    return (this.sizeX || 8) + (this.sizeY || 8);
  }

  public override getVoltageSourceCount(): number {
    return 0;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    const count = this.sizeX * this.sizeY;
    this.diodeStates = Array(count).fill(false);
    this.diodeCurrents = Array(count).fill(0);
    for (const node of this.nodes) CircuitElm.sim.stampNonLinear(node);
  }

  public override doStep(): void {
    for (let row = 0; row < this.sizeY; row += 1) {
      for (let column = 0; column < this.sizeX; column += 1) {
        const index = row * this.sizeX + column;
        const voltage =
          this.volts[this.sizeX + row] - this.volts[column];
        const { current, conductance } =
          LEDArrayElm.linearizeLed(voltage);
        this.diodeStates[index] = voltage > 1.55;
        CircuitElm.sim.stampConductance(
          this.nodes[this.sizeX + row],
          this.nodes[column],
          conductance
        );
        CircuitElm.sim.stampCurrentSource(
          this.nodes[this.sizeX + row],
          this.nodes[column],
          current - conductance * voltage
        );
        this.diodeCurrents[index] = current;
      }
    }
  }

  public override calculateCurrent(): void {
    if (this.diodeCurrents.length === 0) return;
    for (const pin of this.pins) pin.current = 0;
    for (let row = 0; row < this.sizeY; row += 1) {
      let rowCurrent = 0;
      for (let column = 0; column < this.sizeX; column += 1) {
        const index = row * this.sizeX + column;
        const voltage =
          this.volts[this.sizeX + row] - this.volts[column];
        const { current } = LEDArrayElm.linearizeLed(voltage);
        this.diodeCurrents[index] = current;
        rowCurrent += current;
        this.pins[column].current += current;
      }
      this.pins[this.sizeX + row].current = -rowCurrent;
    }
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override dump(): string {
    return `${super.dump()} ${this.sizeX} ${this.sizeY}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "sx", this.sizeX);
    XMLSerializer.dumpAttr(element, "sy", this.sizeY);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.sizeX = xml.parseIntAttr("sx", this.sizeX);
    this.sizeY = xml.parseIntAttr("sy", this.sizeY);
    this.setupPins();
  }

  private static linearizeLed(voltage: number): {
    current: number;
    conductance: number;
  } {
    const knee = 1.55;
    const softness = 0.08;
    const slope = 0.1;
    const normalized = Math.max(
      -40,
      Math.min(40, (voltage - knee) / softness)
    );
    const softplus =
      normalized > 30
        ? voltage - knee
        : softness * Math.log1p(Math.exp(normalized));
    const sigmoid = 1 / (1 + Math.exp(-normalized));
    const leakage = 1e-9;
    return {
      current: slope * softplus + leakage * voltage,
      conductance: slope * sigmoid + leakage
    };
  }
}
