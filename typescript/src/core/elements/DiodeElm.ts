import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { DiodeModel } from "../DiodeModel";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { Diode } from "./Diode";

/** Electrical/model port of DiodeElm.java. */
export class DiodeElm extends CircuitElm {
  public static readonly FLAG_FWDROP = 1;
  public static readonly FLAG_MODEL = 2;
  public static lastModelName = "default";

  public readonly diode: Diode;
  public modelName: string;
  public model: DiodeModel | null = null;
  public hasResistance = false;
  public diodeEndNode = 1;

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
    super(x, y, x2, y2, flags);
    this.diode = new Diode(CircuitElm.sim);
    this.modelName = DiodeElm.lastModelName;

    if (tokenizer !== undefined) {
      let forwardDrop = 0.805904783;
      if ((flags & DiodeElm.FLAG_MODEL) !== 0) {
        this.modelName = CustomLogicModel.unescape(
          tokenizer.nextToken()
        );
      } else {
        if (
          (flags & DiodeElm.FLAG_FWDROP) !== 0 &&
          tokenizer.hasMoreTokens()
        ) {
          forwardDrop = Number(tokenizer.nextToken());
        }
        this.model = DiodeModel.getModelWithParameters(forwardDrop, 0);
        this.modelName = this.model.name;
      }
    }
    this.setup();
  }

  public override nonLinear(): boolean {
    return true;
  }

  public setup(): void {
    this.model = DiodeModel.getModelWithNameOrCopy(
      this.modelName,
      this.model
    );
    this.modelName = this.model.name;
    this.diode.setup(this.model);
    this.hasResistance = this.model.seriesResistance > 0;
    this.diodeEndNode = this.hasResistance ? 2 : 1;
    this.allocNodes();
  }

  public override getInternalNodeCount(): number {
    return this.hasResistance ? 1 : 0;
  }

  public override getDumpType(): number {
    return "d".charCodeAt(0);
  }

  public override dump(): string {
    this.flags |= DiodeElm.FLAG_MODEL;
    return `${super.dump()} ${CustomLogicModel.escape(this.modelName)}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "mo", this.modelName);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.modelName = xml.parseStringAttr("mo", this.modelName) ?? "default";
    this.setup();
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(16);
  }

  public override reset(): void {
    this.diode.reset();
    this.volts.fill(0);
    this.curcount = 0;
  }

  public override stamp(): void {
    const model = this.requireModel();
    if (this.hasResistance) {
      this.diode.stamp(this.nodes[0], this.nodes[2]);
      CircuitElm.sim.stampResistor(
        this.nodes[1],
        this.nodes[2],
        model.seriesResistance
      );
    } else {
      this.diode.stamp(this.nodes[0], this.nodes[1]);
    }
  }

  public override doStep(): void {
    this.diode.doStep(
      this.volts[0] - this.volts[this.diodeEndNode]
    );
  }

  public override calculateCurrent(): void {
    this.current = this.diode.calculateCurrent(
      this.volts[0] - this.volts[this.diodeEndNode]
    );
  }

  public updateModels(): void {
    this.setup();
  }

  private requireModel(): DiodeModel {
    if (this.model === null) {
      throw new Error("Diode model is unavailable");
    }
    return this.model;
  }
}
