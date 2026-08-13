import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Tri-state read-only memory ported from ROMElm/SRAMElm.java. */
export class ROMElm extends ChipElm {
  public static readonly FLAG_HEX_DISPLAY = 4;
  public addressBits = 4;
  public dataBits = 4;
  public addressNodes = 1;
  public dataNodes = 5;
  public internalNodes = 9;
  public address = 0;
  public readonly contents = new Map<number, number>();

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
    super(
      x,
      y,
      x2,
      y2,
      flags,
      tokenizer ?? new StringTokenizer("")
    );
    this.setupPins();
  }

  public override setupPins(): void {
    const addressBits = this.addressBits || 4;
    const dataBits = this.dataBits || 4;
    const addressRows = this.useBus() ? 1 : addressBits;
    const dataRows = this.useBus() ? 1 : dataBits;
    this.sizeX = 2;
    this.sizeY = Math.max(addressRows, dataRows) + 1;
    this.bits = addressBits;
    this.pins = Array<ChipPin>(1 + addressBits + dataBits);
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "OE");
    this.pins[0].lineOver = true;
    this.addressNodes = 1;
    this.dataNodes = 1 + addressBits;
    this.internalNodes = 1 + addressBits + dataBits;
    this.makeBitPins(
      addressBits,
      this.sizeY - addressRows,
      ChipElm.SIDE_W,
      this.addressNodes,
      "A",
      false,
      false,
      true
    );
    this.makeBitPins(
      dataBits,
      this.sizeY - dataRows,
      ChipElm.SIDE_E,
      this.dataNodes,
      "D",
      true,
      false,
      true
    );
    this.allocNodes();
  }

  public override getPostCount(): number {
    return 1 + (this.addressBits || 4) + (this.dataBits || 4);
  }

  public override getInternalNodeCount(): number {
    return this.dataBits || 4;
  }

  public override getVoltageSourceCount(): number {
    return this.dataBits || 4;
  }

  public override getChipName(): string {
    return "ROM";
  }

  public override getDumpType(): number {
    return 436;
  }

  public override getXmlDumpType(): string {
    return "ROM";
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

  public override stamp(): void {
    for (let bit = 0; bit < this.dataBits; bit += 1) {
      const source = this.requireDataSource(bit);
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
    const outputEnabled = this.volts[0] < this.getThreshold();
    this.address = 0;
    for (let bit = 0; bit < this.addressBits; bit += 1) {
      if (this.volts[this.addressNodes + bit] > this.getThreshold()) {
        this.address |= 1 << (this.addressBits - 1 - bit);
      }
    }
    const data = this.contents.get(this.address) ?? 0;
    for (let bit = 0; bit < this.dataBits; bit += 1) {
      CircuitElm.sim.updateVoltageSource(
        CircuitNode.ground,
        this.nodes[this.internalNodes + bit],
        this.requireDataSource(bit),
        (data & (1 << (this.dataBits - 1 - bit))) === 0
          ? 0
          : this.highVoltage
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

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ab", this.addressBits);
    XMLSerializer.dumpAttr(element, "db", this.dataBits);
    const lines = this.contentsToString();
    if (lines.length > 0) element.appendChild(document.createTextNode(lines));
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.addressBits = xml.parseIntAttr("ab", this.addressBits);
    this.dataBits = xml.parseIntAttr("db", this.dataBits);
    this.parseContents(xml.parseContents() ?? "");
    this.setupPins();
  }

  private parseContents(source: string): void {
    this.contents.clear();
    for (const line of source.split(/\r?\n/)) {
      const parts = line.split(/:\s*/);
      if (parts.length !== 2) continue;
      let address = this.parseNumber(parts[0]);
      for (const token of parts[1].trim().split(/\s+/)) {
        if (token.length > 0) {
          this.contents.set(address, this.parseNumber(token));
          address += 1;
        }
      }
    }
  }

  private contentsToString(): string {
    return [...this.contents.entries()]
      .sort(([a], [b]) => a - b)
      .map(([address, value]) => `${address}: ${value}`)
      .join("\n");
  }

  private parseNumber(source: string): number {
    const value = source.trim();
    if (/^0x/i.test(value)) return Number.parseInt(value.slice(2), 16);
    if (/^0b/i.test(value)) return Number.parseInt(value.slice(2), 2);
    return Number.parseInt(
      value,
      this.hasFlag(ROMElm.FLAG_HEX_DISPLAY) ? 16 : 10
    );
  }

  private requireDataSource(bit: number): VoltageSource {
    const source = this.pins[this.dataNodes + bit].voltSource;
    if (source === null) {
      throw new Error(`ROM data source ${bit} is unassigned`);
    }
    return source;
  }
}
