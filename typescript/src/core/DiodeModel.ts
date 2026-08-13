import { CustomLogicModel } from "./CustomLogicModel";
import { StringTokenizer } from "./StringTokenizer";
import { XMLDeserializer } from "./XMLDeserializer";
import { XMLSerializer } from "./XMLSerializer";

/** Portable model registry and calculations from DiodeModel.java. */
export class DiodeModel {
  public static readonly FLAGS_SIMPLE = 1;
  public static readonly vt = 0.025865;
  private static modelMap: Map<string, DiodeModel> | null = null;

  public flags = 0;
  public name = "";
  public description: string | null = null;
  public saturationCurrent = 1e-14;
  public seriesResistance = 0;
  public emissionCoefficient = 1;
  public breakdownVoltage = 0;
  public forwardVoltage = 0;
  public forwardCurrent = 0;
  public dumped = false;
  public readOnly = false;
  public builtIn = false;
  public oldStyle = false;
  public internal = false;
  public vscale = DiodeModel.vt;
  public vdcoef = 1 / DiodeModel.vt;
  public fwdrop = 0;

  public constructor(copy?: DiodeModel);
  public constructor(
    saturationCurrent: number,
    seriesResistance: number,
    emissionCoefficient: number,
    breakdownVoltage: number,
    description?: string | null
  );
  public constructor(
    copyOrSaturation?: DiodeModel | number,
    seriesResistance = 0,
    emissionCoefficient = 1,
    breakdownVoltage = 0,
    description: string | null = null
  ) {
    if (copyOrSaturation instanceof DiodeModel) {
      this.flags = copyOrSaturation.flags;
      this.saturationCurrent = copyOrSaturation.saturationCurrent;
      this.seriesResistance = copyOrSaturation.seriesResistance;
      this.emissionCoefficient = copyOrSaturation.emissionCoefficient;
      this.breakdownVoltage = copyOrSaturation.breakdownVoltage;
      this.forwardCurrent = copyOrSaturation.forwardCurrent;
    } else if (typeof copyOrSaturation === "number") {
      this.saturationCurrent = copyOrSaturation;
      this.seriesResistance = seriesResistance;
      this.emissionCoefficient = emissionCoefficient;
      this.breakdownVoltage = breakdownVoltage;
      this.description = description;
    }
    this.updateModel();
  }

  public static getModelWithName(name: string): DiodeModel {
    DiodeModel.createModelMap();
    const models = DiodeModel.modelMap as Map<string, DiodeModel>;
    const existing = models.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const model = new DiodeModel();
    model.name = name;
    models.set(name, model);
    return model;
  }

  public static getModelWithNameOrCopy(
    name: string,
    oldModel: DiodeModel | null
  ): DiodeModel {
    DiodeModel.createModelMap();
    const models = DiodeModel.modelMap as Map<string, DiodeModel>;
    const existing = models.get(name);
    if (existing !== undefined) {
      return existing;
    }
    if (oldModel === null) {
      return DiodeModel.getDefaultModel();
    }
    const model = new DiodeModel(oldModel);
    model.name = name;
    models.set(name, model);
    return model;
  }

  public static getModelWithParameters(
    forwardDrop: number,
    zenerVoltage: number
  ): DiodeModel {
    DiodeModel.createModelMap();
    const models = DiodeModel.modelMap as Map<string, DiodeModel>;
    const emissionCoefficient = 2;
    for (const model of models.values()) {
      if (
        Math.abs(model.fwdrop - forwardDrop) < 1e-8 &&
        model.seriesResistance === 0 &&
        Math.abs(model.breakdownVoltage - zenerVoltage) < 1e-8 &&
        model.emissionCoefficient === emissionCoefficient
      ) {
        return model;
      }
    }

    const scale = emissionCoefficient * DiodeModel.vt;
    const leakage = 1 / (Math.exp(forwardDrop / scale) - 1);
    const name =
      `fwdrop=${forwardDrop}` +
      (zenerVoltage !== 0 ? ` zvoltage=${zenerVoltage}` : "");
    const model = DiodeModel.getModelWithName(name);
    model.saturationCurrent = leakage;
    model.emissionCoefficient = emissionCoefficient;
    model.breakdownVoltage = zenerVoltage;
    model.readOnly = true;
    model.oldStyle = true;
    model.updateModel();
    return model;
  }

  public static getDefaultModel(): DiodeModel {
    return DiodeModel.getModelWithName("default");
  }

  public static undumpModel(tokenizer: StringTokenizer): DiodeModel {
    const name = CustomLogicModel.unescape(tokenizer.nextToken());
    const model = DiodeModel.getModelWithName(name);
    model.undump(tokenizer);
    return model;
  }

  public undump(tokenizer: StringTokenizer): void {
    this.flags = Number.parseInt(tokenizer.nextToken(), 10);
    this.saturationCurrent = Number(tokenizer.nextToken());
    this.seriesResistance = Number(tokenizer.nextToken());
    this.emissionCoefficient = Number(tokenizer.nextToken());
    this.breakdownVoltage = Number(tokenizer.nextToken());
    if (tokenizer.hasMoreTokens()) {
      this.forwardCurrent = Number(tokenizer.nextToken());
    }
    this.updateModel();
  }

  public undumpXml(xml: XMLDeserializer): void {
    this.flags = xml.parseIntAttr("f", this.flags);
    this.saturationCurrent = xml.parseDoubleAttr(
      "is",
      this.saturationCurrent
    );
    this.seriesResistance = xml.parseDoubleAttr(
      "rs",
      this.seriesResistance
    );
    this.emissionCoefficient = xml.parseDoubleAttr(
      "n",
      this.emissionCoefficient
    );
    this.breakdownVoltage = xml.parseDoubleAttr(
      "bv",
      this.breakdownVoltage
    );
    this.forwardCurrent = xml.parseDoubleAttr("fi", this.forwardCurrent);
    this.updateModel();
  }

  public updateModel(): void {
    this.vscale = this.emissionCoefficient * DiodeModel.vt;
    this.vdcoef = 1 / this.vscale;
    this.fwdrop =
      Math.log(1 / this.saturationCurrent + 1) *
      this.emissionCoefficient *
      DiodeModel.vt;
  }

  public dump(): string {
    this.dumped = true;
    return (
      `34 ${CustomLogicModel.escape(this.name)} ${this.flags} ` +
      `${this.saturationCurrent} ${this.seriesResistance} ` +
      `${this.emissionCoefficient} ${this.breakdownVoltage} ` +
      `${this.forwardCurrent}`
    );
  }

  public dumpXml(document: Document): void {
    this.dumped = true;
    const element = document.createElement("dm");
    XMLSerializer.dumpAttr(element, "nm", this.name);
    XMLSerializer.dumpAttr(element, "f", this.flags);
    XMLSerializer.dumpAttr(element, "is", this.saturationCurrent);
    XMLSerializer.dumpAttr(element, "rs", this.seriesResistance);
    XMLSerializer.dumpAttr(element, "n", this.emissionCoefficient);
    XMLSerializer.dumpAttr(element, "bv", this.breakdownVoltage);
    if (this.forwardCurrent > 0) {
      XMLSerializer.dumpAttr(element, "fi", this.forwardCurrent);
    }
    document.documentElement.appendChild(element);
  }

  public isSimple(): boolean {
    return (this.flags & DiodeModel.FLAGS_SIMPLE) !== 0;
  }

  public setSimple(simple: boolean): void {
    this.flags = simple ? DiodeModel.FLAGS_SIMPLE : 0;
  }

  public setForwardVoltage(): void {
    if (this.forwardCurrent === 0) {
      this.forwardCurrent = 1;
    }
    this.forwardVoltage =
      this.emissionCoefficient *
      DiodeModel.vt *
      Math.log(this.forwardCurrent / this.saturationCurrent + 1);
  }

  private static createModelMap(): void {
    if (DiodeModel.modelMap !== null) {
      return;
    }
    DiodeModel.modelMap = new Map<string, DiodeModel>();
    DiodeModel.addDefaultModel(
      "spice-default",
      new DiodeModel(1e-14, 0, 1, 0)
    );
    DiodeModel.addDefaultModel(
      "default",
      new DiodeModel(1.7143528192808883e-7, 0, 2, 0)
    );
    DiodeModel.addDefaultModel(
      "default-zener",
      new DiodeModel(1.7143528192808883e-7, 0, 2, 5.6)
    );
    DiodeModel.addDefaultModel(
      "default-led",
      new DiodeModel(93.2e-12, 0.042, 3.73, 0)
    );
    DiodeModel.addDefaultModel(
      "1N4148",
      new DiodeModel(4.352e-9, 0.6458, 1.906, 75, "switching")
    );
    DiodeModel.addDefaultModel(
      "1N4004",
      new DiodeModel(18.8e-9, 28.6e-3, 2, 400, "general purpose")
    );
  }

  private static addDefaultModel(name: string, model: DiodeModel): void {
    (DiodeModel.modelMap as Map<string, DiodeModel>).set(name, model);
    model.readOnly = true;
    model.builtIn = true;
    model.name = name;
  }
}
