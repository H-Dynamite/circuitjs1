import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Sparse static RAM with active-low write and output enables. */
export class SRAMElm extends ChipElm {
  public static readonly FLAG_RELOAD_ON_RESET = 2;
  public static readonly FLAG_HEX_DISPLAY = 4;
  public addressNodes = 2;
  public dataNodes = 6;
  public internalNodes = 10;
  public addressBits = 4;
  public dataBits = 4;
  public map = new Map<number, number>();
  public initialMap: Map<number, number> | null = null;
  public address = 0;

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
      this.addressBits =
        Number.parseInt(tokenizer.nextToken(), 10) ||
        this.addressBits;
    }
    if (tokenizer.hasMoreTokens()) {
      this.dataBits =
        Number.parseInt(tokenizer.nextToken(), 10) || this.dataBits;
    }
    while (tokenizer.hasMoreTokens()) {
      const address = Number.parseInt(tokenizer.nextToken(), 10);
      if (!Number.isFinite(address) || address < 0) break;
      let currentAddress = address;
      while (tokenizer.hasMoreTokens()) {
        const value = Number.parseInt(tokenizer.nextToken(), 10);
        if (!Number.isFinite(value) || value < 0) break;
        this.map.set(currentAddress, value);
        currentAddress += 1;
      }
    }
    if (this.hasFlag(SRAMElm.FLAG_RELOAD_ON_RESET)) {
      this.initialMap = new Map(this.map);
    }
    this.setupPins();
  }

  public override setupPins(): void {
    const addressBits = this.addressBits || 4;
    const dataBits = this.dataBits || 4;
    this.addressBits = addressBits;
    this.dataBits = dataBits;
    this.sizeX = 2;
    const addressY = this.useBus() ? 1 : addressBits;
    const dataY = this.useBus() ? 1 : dataBits;
    this.sizeY = Math.max(addressY, dataY) + 1;
    this.bits = addressBits;
    this.pins = Array<ChipPin>(2 + addressBits + dataBits);
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "WE");
    this.pins[0].lineOver = true;
    this.pins[1] = new ChipPin(0, ChipElm.SIDE_E, "OE");
    this.pins[1].lineOver = true;
    this.addressNodes = 2;
    this.dataNodes = 2 + addressBits;
    this.internalNodes = 2 + addressBits + dataBits;
    this.makeBitPins(
      addressBits,
      this.sizeY - addressY,
      ChipElm.SIDE_W,
      this.addressNodes,
      "A",
      false,
      false,
      true
    );
    this.makeBitPins(
      dataBits,
      this.sizeY - dataY,
      ChipElm.SIDE_E,
      this.dataNodes,
      "D",
      true,
      false,
      true
    );
    this.allocNodes();
  }

  public override getChipName(): string {
    return "Static RAM";
  }

  public override getDumpType(): number {
    return 413;
  }

  public override getPostCount(): number {
    return 2 + (this.addressBits || 4) + (this.dataBits || 4);
  }

  public override getVoltageSourceCount(): number {
    return this.dataBits || 4;
  }

  public override getInternalNodeCount(): number {
    return this.dataBits || 4;
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    source.setNodes(
      CircuitNode.ground,
      this.nodes[this.internalNodes + index]
    );
  }

  public override getMatrixConnection(
    first: number,
    second: number
  ): boolean {
    for (let bit = 0; bit < this.dataBits; bit += 1) {
      if (
        this.comparePair(
          first,
          second,
          this.internalNodes + bit,
          this.dataNodes + bit
        )
      ) {
        return true;
      }
    }
    return false;
  }

  public override stamp(): void {
    for (let bit = 0; bit < this.dataBits; bit += 1) {
      const source = this.pins[this.dataNodes + bit].voltSource;
      if (source === null) throw new Error("SRAM source is unassigned");
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[this.internalNodes + bit],
        source
      );
      CircuitElm.sim.stampNonLinear(
        this.nodes[this.internalNodes + bit]
      );
      CircuitElm.sim.stampNonLinear(this.nodes[this.dataNodes + bit]);
    }
  }

  public override doStep(): void {
    const writeEnabled = this.volts[0] < this.getThreshold();
    const outputEnabled =
      this.volts[1] < this.getThreshold() && !writeEnabled;
    this.address = 0;
    for (let bit = 0; bit < this.addressBits; bit += 1) {
      if (
        this.volts[this.addressNodes + bit] > this.getThreshold()
      ) {
        this.address |= 1 << (this.addressBits - 1 - bit);
      }
    }
    const data = this.map.get(this.address) ?? 0;
    for (let bit = 0; bit < this.dataBits; bit += 1) {
      const source = this.pins[this.dataNodes + bit].voltSource;
      if (source === null) throw new Error("SRAM source is unassigned");
      const high =
        (data & (1 << (this.dataBits - 1 - bit))) !== 0;
      CircuitElm.sim.updateVoltageSource(
        CircuitNode.ground,
        this.nodes[this.internalNodes + bit],
        source,
        high ? this.highVoltage : 0
      );
      if (outputEnabled) {
        CircuitElm.sim.stampResistor(
          this.nodes[this.internalNodes + bit],
          this.nodes[this.dataNodes + bit],
          1
        );
      } else {
        CircuitElm.sim.stampResistor(
          this.nodes[this.dataNodes + bit],
          CircuitNode.ground,
          1e8
        );
      }
    }
  }

  public override stepFinished(): void {
    if (this.volts[0] >= this.getThreshold()) return;
    let data = 0;
    for (let bit = 0; bit < this.dataBits; bit += 1) {
      if (this.volts[this.dataNodes + bit] > this.getThreshold()) {
        data |= 1 << (this.dataBits - 1 - bit);
      }
    }
    this.map.set(this.address, data);
  }

  public override reset(): void {
    super.reset();
    if (
      this.hasFlag(SRAMElm.FLAG_RELOAD_ON_RESET) &&
      this.initialMap !== null
    ) {
      this.map = new Map(this.initialMap);
    }
  }

  public contentsToString(): string {
    const radix = this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY) ? 16 : 10;
    return [...this.map.entries()]
      .filter(([, value]) => value !== 0)
      .sort(([first], [second]) => first - second)
      .map(
        ([address, value]) =>
          `${address.toString(radix).toUpperCase()}: ` +
          value.toString(radix).toUpperCase()
      )
      .join("\n");
  }

  public parseContentsString(source: string): void {
    this.map.clear();
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*([^:]+):\s*(.+)$/);
      if (match === null) continue;
      let address = this.parseNumber(match[1]);
      for (const token of match[2].trim().split(/\s+/)) {
        this.map.set(address, this.parseNumber(token));
        address += 1;
      }
    }
  }

  private parseNumber(value: string): number {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.startsWith("0x")) return Number.parseInt(trimmed.slice(2), 16);
    if (trimmed.startsWith("0b")) return Number.parseInt(trimmed.slice(2), 2);
    return Number.parseInt(
      trimmed,
      this.hasFlag(SRAMElm.FLAG_HEX_DISPLAY) ? 16 : 10
    );
  }

  public override dump(): string {
    const state = [...this.map.entries()]
      .filter(([, value]) => value !== 0)
      .sort(([first], [second]) => first - second)
      .flatMap(([address, value]) => [address, value, -1]);
    return (
      `${super.dump()} ${this.addressBits} ${this.dataBits}` +
      (state.length > 0 ? ` ${state.join(" ")}` : "") +
      " -2"
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ab", this.addressBits);
    XMLSerializer.dumpAttr(element, "db", this.dataBits);
    const contents = this.contentsToString();
    if (contents.length > 0) {
      element.append(document.createTextNode(contents));
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    const contents = xml.parseContents();
    super.undumpXml(xml);
    this.addressBits = xml.parseIntAttr("ab", this.addressBits);
    this.dataBits = xml.parseIntAttr("db", this.dataBits);
    if (contents !== null) this.parseContentsString(contents);
    this.setupPins();
    if (this.hasFlag(SRAMElm.FLAG_RELOAD_ON_RESET)) {
      this.initialMap = new Map(this.map);
    }
  }
}
