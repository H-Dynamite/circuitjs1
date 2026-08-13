import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Bidirectional tri-state bus transceiver from BusTransceiverElm.java. */
export class BusTransceiverElm extends ChipElm {
  public dataBits = 4;
  public aNodes = 2;
  public bNodes = 6;
  public intNodes = 10;
  public voltageSources: Array<VoltageSource | null> = [];

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
      this.dataBits =
        Number.parseInt(tokenizer.nextToken(), 10) || this.dataBits;
    }
    this.setupPins();
  }

  public override setupPins(): void {
    const dataBits = this.dataBits || 4;
    this.dataBits = dataBits;
    this.sizeX = 2;
    const dataY = this.useBus() ? 1 : dataBits;
    this.sizeY = dataY + 2;
    this.bits = dataBits;
    this.pins = Array<ChipPin>(2 + 2 * dataBits);
    this.pins[0] = new ChipPin(0, ChipElm.SIDE_W, "OE");
    this.pins[0].lineOver = true;
    this.pins[1] = new ChipPin(0, ChipElm.SIDE_E, "DIR");
    this.aNodes = 2;
    this.bNodes = 2 + dataBits;
    this.intNodes = 2 + 2 * dataBits;
    this.makeBitPins(
      dataBits,
      this.sizeY - dataY,
      ChipElm.SIDE_W,
      this.aNodes,
      "A",
      false,
      false,
      true
    );
    this.makeBitPins(
      dataBits,
      this.sizeY - dataY,
      ChipElm.SIDE_E,
      this.bNodes,
      "B",
      false,
      false,
      true
    );
    this.allocNodes();
  }

  public override getPostCount(): number {
    return 2 + 2 * (this.dataBits || 4);
  }

  public override getInternalNodeCount(): number {
    return this.dataBits || 4;
  }

  public override getVoltageSourceCount(): number {
    return this.dataBits || 4;
  }

  public override getChipName(): string {
    return "Bus Transceiver";
  }

  public override getXmlDumpType(): string {
    return "BusTransceiver";
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    source.setNodes(
      CircuitNode.ground,
      this.nodes[this.intNodes + index]
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
          this.intNodes + bit,
          this.aNodes + bit
        ) ||
        this.comparePair(
          first,
          second,
          this.intNodes + bit,
          this.bNodes + bit
        )
      ) {
        return true;
      }
    }
    return false;
  }

  public override stamp(): void {
    for (let bit = 0; bit < this.dataBits; bit += 1) {
      const source = this.voltageSources[bit];
      if (source === null || source === undefined) {
        throw new Error("Bus transceiver source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[this.intNodes + bit],
        source
      );
      CircuitElm.sim.stampNonLinear(this.nodes[this.intNodes + bit]);
      CircuitElm.sim.stampNonLinear(this.nodes[this.aNodes + bit]);
      CircuitElm.sim.stampNonLinear(this.nodes[this.bNodes + bit]);
    }
  }

  public override doStep(): void {
    const enabled = this.volts[0] < this.getThreshold();
    const aToB = this.volts[1] > this.getThreshold();
    for (let bit = 0; bit < this.dataBits; bit += 1) {
      const source = this.voltageSources[bit];
      if (source === null || source === undefined) {
        throw new Error("Bus transceiver source is unassigned");
      }
      const sourceValue =
        this.volts[(aToB ? this.aNodes : this.bNodes) + bit] >
        this.getThreshold();
      CircuitElm.sim.updateVoltageSource(
        CircuitNode.ground,
        this.nodes[this.intNodes + bit],
        source,
        sourceValue ? this.highVoltage : 0
      );
      const destinationResistance = enabled ? 1 : 1e10;
      CircuitElm.sim.stampResistor(
        this.nodes[this.intNodes + bit],
        this.nodes[this.aNodes + bit],
        aToB ? 1e8 : destinationResistance
      );
      CircuitElm.sim.stampResistor(
        this.nodes[this.intNodes + bit],
        this.nodes[this.bNodes + bit],
        aToB ? destinationResistance : 1e8
      );
    }
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "db", this.dataBits);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.dataBits = xml.parseIntAttr("db", this.dataBits);
    this.setupPins();
  }
}
