import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Inductor } from "./Inductor";

/** Quartz crystal equivalent circuit: Cp || (Cs-L-R). */
export class CrystalElm extends CircuitElm {
  public parallelCapacitance = 28.7e-12;
  public seriesCapacitance = 0.1e-12;
  public inductance = 2.5e-3;
  public resistance = 6.4;
  private readonly inductor = new Inductor(CircuitElm.sim);
  private parallelResistance = 1;
  private seriesResistance = 1;
  private parallelVoltage = 0;
  private seriesVoltage = 0;
  private parallelCurrent = 0;
  private seriesCurrent = 0;
  private parallelSource = 0;
  private seriesSource = 0;

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
    flags = 2,
    _tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    this.setupInductor();
  }

  public override getDumpType(): number {
    return 412;
  }

  public override getXmlDumpType(): string {
    return "cr";
  }

  public override getInternalNodeCount(): number {
    return 2;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "pc", this.parallelCapacitance);
    XMLSerializer.dumpAttr(element, "sc", this.seriesCapacitance);
    XMLSerializer.dumpAttr(element, "in", this.inductance);
    XMLSerializer.dumpAttr(element, "r", this.resistance);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.resistance = xml.parseDoubleAttr("r", this.resistance);
    this.inductance = xml.parseDoubleAttr("in", this.inductance);
    this.parallelCapacitance = xml.parseDoubleAttr(
      "pc",
      this.parallelCapacitance
    );
    this.seriesCapacitance = xml.parseDoubleAttr(
      "sc",
      this.seriesCapacitance
    );
    this.setupInductor();
  }

  public override reset(): void {
    super.reset();
    this.parallelVoltage = 0;
    this.seriesVoltage = 0;
    this.parallelCurrent = 0;
    this.seriesCurrent = 0;
    this.inductor.reset();
  }

  public override stamp(): void {
    this.parallelResistance =
      CircuitElm.sim.timeStep / (2 * this.parallelCapacitance);
    this.seriesResistance =
      CircuitElm.sim.timeStep / (2 * this.seriesCapacitance);
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.parallelResistance
    );
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[2],
      this.seriesResistance
    );
    CircuitElm.sim.stampRightSide(this.nodes[0]);
    CircuitElm.sim.stampRightSide(this.nodes[1]);
    CircuitElm.sim.stampRightSide(this.nodes[2]);
    this.inductor.stamp(this.nodes[2], this.nodes[3]);
    CircuitElm.sim.stampResistor(
      this.nodes[3],
      this.nodes[1],
      this.resistance
    );
  }

  public override startIteration(): void {
    this.parallelSource =
      -this.parallelVoltage / this.parallelResistance -
      this.parallelCurrent;
    this.seriesSource =
      -this.seriesVoltage / this.seriesResistance - this.seriesCurrent;
    this.inductor.startIteration(this.volts[2] - this.volts[3]);
  }

  public override doStep(): void {
    CircuitElm.sim.stampCurrentSource(
      this.nodes[0],
      this.nodes[1],
      this.parallelSource
    );
    CircuitElm.sim.stampCurrentSource(
      this.nodes[0],
      this.nodes[2],
      this.seriesSource
    );
    this.inductor.doStep(this.volts[2] - this.volts[3]);
  }

  public override calculateCurrent(): void {
    this.parallelCurrent =
      (this.volts[0] - this.volts[1]) / this.parallelResistance +
      this.parallelSource;
    this.seriesCurrent =
      (this.volts[0] - this.volts[2]) / this.seriesResistance +
      this.seriesSource;
    this.inductor.calculateCurrent(this.volts[2] - this.volts[3]);
    this.current = this.parallelCurrent + this.seriesCurrent;
  }

  public override stepFinished(): void {
    this.parallelVoltage = this.volts[0] - this.volts[1];
    this.seriesVoltage = this.volts[0] - this.volts[2];
    this.calculateCurrent();
  }

  private setupInductor(): void {
    this.inductor.setup(this.inductance, 0, 0);
  }
}
