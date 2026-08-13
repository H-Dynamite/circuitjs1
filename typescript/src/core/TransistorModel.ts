import { CustomLogicModel } from "./CustomLogicModel";
import { StringTokenizer } from "./StringTokenizer";
import { XMLDeserializer } from "./XMLDeserializer";
import { XMLSerializer } from "./XMLSerializer";

/** Portable SPICE BJT model registry from TransistorModel.java. */
export class TransistorModel {
  private static modelMap: Map<string, TransistorModel> | null = null;

  public flags = 0;
  public name = "";
  public description: string | null = null;
  public satCur = 0;
  public invRollOffF = 0;
  public BEleakCur = 0;
  public leakBEemissionCoeff = 0;
  public invRollOffR = 0;
  public BCleakCur = 0;
  public leakBCemissionCoeff = 0;
  public emissionCoeffF = 0;
  public emissionCoeffR = 0;
  public invEarlyVoltF = 0;
  public invEarlyVoltR = 0;
  public betaR = 0;
  public junctionCapBE = 0;
  public junctionCapBC = 0;
  public junctionPotBE = 0.75;
  public junctionPotBC = 0.75;
  public junctionExpBE = 0.33;
  public junctionExpBC = 0.33;
  public transitTimeF = 0;
  public transitTimeR = 0;
  public dumped = false;
  public readOnly = false;
  public builtIn = false;
  public internal = false;

  public constructor();
  public constructor(description: string, saturationCurrent: number);
  public constructor(copy: TransistorModel);
  public constructor(
    descriptionOrCopy?: string | TransistorModel,
    saturationCurrent = 0
  ) {
    if (descriptionOrCopy instanceof TransistorModel) {
      Object.assign(this, {
        flags: descriptionOrCopy.flags,
        satCur: descriptionOrCopy.satCur,
        invRollOffF: descriptionOrCopy.invRollOffF,
        BEleakCur: descriptionOrCopy.BEleakCur,
        leakBEemissionCoeff:
          descriptionOrCopy.leakBEemissionCoeff,
        invRollOffR: descriptionOrCopy.invRollOffR,
        BCleakCur: descriptionOrCopy.BCleakCur,
        leakBCemissionCoeff:
          descriptionOrCopy.leakBCemissionCoeff,
        emissionCoeffF: descriptionOrCopy.emissionCoeffF,
        emissionCoeffR: descriptionOrCopy.emissionCoeffR,
        invEarlyVoltF: descriptionOrCopy.invEarlyVoltF,
        invEarlyVoltR: descriptionOrCopy.invEarlyVoltR,
        betaR: descriptionOrCopy.betaR,
        junctionCapBE: descriptionOrCopy.junctionCapBE,
        junctionPotBE: descriptionOrCopy.junctionPotBE,
        junctionExpBE: descriptionOrCopy.junctionExpBE,
        junctionCapBC: descriptionOrCopy.junctionCapBC,
        junctionPotBC: descriptionOrCopy.junctionPotBC,
        junctionExpBC: descriptionOrCopy.junctionExpBC,
        transitTimeF: descriptionOrCopy.transitTimeF,
        transitTimeR: descriptionOrCopy.transitTimeR
      });
    } else if (typeof descriptionOrCopy === "string") {
      this.description = descriptionOrCopy;
      this.satCur = saturationCurrent;
      this.emissionCoeffF = 1;
      this.emissionCoeffR = 1;
      this.leakBEemissionCoeff = 1.5;
      this.leakBCemissionCoeff = 2;
      this.betaR = 1;
    }
    this.updateModel();
  }

  public static getModelWithName(name: string): TransistorModel {
    TransistorModel.createModelMap();
    const models = TransistorModel.modelMap as Map<
      string,
      TransistorModel
    >;
    const existing = models.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const model = new TransistorModel();
    model.name = name;
    models.set(name, model);
    return model;
  }

  public static getModelWithNameOrCopy(
    name: string,
    oldModel: TransistorModel | null
  ): TransistorModel {
    TransistorModel.createModelMap();
    const models = TransistorModel.modelMap as Map<
      string,
      TransistorModel
    >;
    const existing = models.get(name);
    if (existing !== undefined) {
      return existing;
    }
    if (oldModel === null) {
      return TransistorModel.getDefaultModel();
    }
    const model = new TransistorModel(oldModel);
    model.name = name;
    models.set(name, model);
    return model;
  }

  public static getDefaultModel(): TransistorModel {
    return TransistorModel.getModelWithName("default");
  }

  public static getModelList(): TransistorModel[] {
    TransistorModel.createModelMap();
    return Array.from(
      new Set(
        Array.from(
          (TransistorModel.modelMap as Map<
            string,
            TransistorModel
          >).values()
        ).filter((model) => !model.internal)
      )
    ).sort((first, second) => first.name.localeCompare(second.name));
  }

  public static clearDumpedFlags(): void {
    for (const model of TransistorModel.modelMap?.values() ?? []) {
      model.dumped = false;
    }
  }

  public static undumpModel(
    tokenizer: StringTokenizer
  ): TransistorModel {
    const name = CustomLogicModel.unescape(tokenizer.nextToken());
    const model = TransistorModel.getModelWithName(name);
    model.undump(tokenizer);
    return model;
  }

  public static undumpModelXml(
    xml: XMLDeserializer
  ): TransistorModel {
    const name = xml.parseStringAttr("nm", "default") ?? "default";
    const model = TransistorModel.getModelWithName(name);
    model.undumpXml(xml);
    return model;
  }

  public getDescription(): string {
    return this.description === null || this.description === this.name
      ? this.name
      : `${this.name} (${this.description})`;
  }

  public undump(tokenizer: StringTokenizer): void {
    const required: Array<keyof TransistorModel> = [
      "flags",
      "satCur",
      "invRollOffF",
      "BEleakCur",
      "leakBEemissionCoeff",
      "invRollOffR",
      "BCleakCur",
      "leakBCemissionCoeff",
      "emissionCoeffF",
      "emissionCoeffR",
      "invEarlyVoltF",
      "invEarlyVoltR",
      "betaR"
    ];
    for (const property of required) {
      if (!tokenizer.hasMoreTokens()) {
        throw new Error(`Missing transistor model field ${property}`);
      }
      (this[property] as number) = Number(tokenizer.nextToken());
    }

    const optional: Array<keyof TransistorModel> = [
      "junctionCapBE",
      "junctionPotBE",
      "junctionExpBE",
      "junctionCapBC",
      "junctionPotBC",
      "junctionExpBC",
      "transitTimeF",
      "transitTimeR"
    ];
    for (const property of optional) {
      if (!tokenizer.hasMoreTokens()) {
        break;
      }
      (this[property] as number) = Number(tokenizer.nextToken());
    }
    this.updateModel();
  }

  public undumpXml(xml: XMLDeserializer): void {
    this.flags = xml.parseIntAttr("f", this.flags);
    this.satCur = xml.parseDoubleAttr("is", this.satCur);
    this.invRollOffF = xml.parseDoubleAttr("ikf", this.invRollOffF);
    this.BEleakCur = xml.parseDoubleAttr("ise", this.BEleakCur);
    this.leakBEemissionCoeff = xml.parseDoubleAttr(
      "ne",
      this.leakBEemissionCoeff
    );
    this.invRollOffR = xml.parseDoubleAttr("ikr", this.invRollOffR);
    this.BCleakCur = xml.parseDoubleAttr("isc", this.BCleakCur);
    this.leakBCemissionCoeff = xml.parseDoubleAttr(
      "nc",
      this.leakBCemissionCoeff
    );
    this.emissionCoeffF = xml.parseDoubleAttr(
      "nf",
      this.emissionCoeffF
    );
    this.emissionCoeffR = xml.parseDoubleAttr(
      "nr",
      this.emissionCoeffR
    );
    this.invEarlyVoltF = xml.parseDoubleAttr(
      "vaf",
      this.invEarlyVoltF
    );
    this.invEarlyVoltR = xml.parseDoubleAttr(
      "var",
      this.invEarlyVoltR
    );
    this.betaR = xml.parseDoubleAttr("br", this.betaR);
    this.junctionCapBE = xml.parseDoubleAttr(
      "cje",
      this.junctionCapBE
    );
    this.junctionPotBE = xml.parseDoubleAttr(
      "vje",
      this.junctionPotBE
    );
    this.junctionExpBE = xml.parseDoubleAttr(
      "mje",
      this.junctionExpBE
    );
    this.junctionCapBC = xml.parseDoubleAttr(
      "cjc",
      this.junctionCapBC
    );
    this.junctionPotBC = xml.parseDoubleAttr(
      "vjc",
      this.junctionPotBC
    );
    this.junctionExpBC = xml.parseDoubleAttr(
      "mjc",
      this.junctionExpBC
    );
    this.transitTimeF = xml.parseDoubleAttr(
      "tf",
      this.transitTimeF
    );
    this.transitTimeR = xml.parseDoubleAttr(
      "tr",
      this.transitTimeR
    );
    this.updateModel();
  }

  public dumpXml(document: Document): void {
    this.dumped = true;
    const element = document.createElement("tm");
    const values: Record<string, string | number> = {
      nm: this.name,
      f: this.flags,
      is: this.satCur,
      ikf: this.invRollOffF,
      ise: this.BEleakCur,
      ne: this.leakBEemissionCoeff,
      ikr: this.invRollOffR,
      isc: this.BCleakCur,
      nc: this.leakBCemissionCoeff,
      nf: this.emissionCoeffF,
      nr: this.emissionCoeffR,
      vaf: this.invEarlyVoltF,
      var: this.invEarlyVoltR,
      br: this.betaR
    };
    for (const [name, value] of Object.entries(values)) {
      XMLSerializer.dumpAttr(element, name, value);
    }
    if (this.junctionCapBE !== 0) {
      XMLSerializer.dumpAttr(element, "cje", this.junctionCapBE);
      XMLSerializer.dumpAttr(element, "vje", this.junctionPotBE);
      XMLSerializer.dumpAttr(element, "mje", this.junctionExpBE);
    }
    if (this.junctionCapBC !== 0) {
      XMLSerializer.dumpAttr(element, "cjc", this.junctionCapBC);
      XMLSerializer.dumpAttr(element, "vjc", this.junctionPotBC);
      XMLSerializer.dumpAttr(element, "mjc", this.junctionExpBC);
    }
    if (this.transitTimeF !== 0) {
      XMLSerializer.dumpAttr(element, "tf", this.transitTimeF);
    }
    if (this.transitTimeR !== 0) {
      XMLSerializer.dumpAttr(element, "tr", this.transitTimeR);
    }
    document.documentElement.appendChild(element);
  }

  public updateModel(): void {}

  private static createModelMap(): void {
    if (TransistorModel.modelMap !== null) {
      return;
    }
    TransistorModel.modelMap = new Map<string, TransistorModel>();
    TransistorModel.addDefaultModel(
      "default",
      new TransistorModel("default", 1e-13)
    );
    TransistorModel.addDefaultModel(
      "spice-default",
      new TransistorModel("spice-default", 1e-16)
    );
    const internalModels = [
      "xlm324v2-qpi 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.0034482758620689655 0 1",
      "xlm324v2-qpa 0 1.01e-16 333.3333333333333 0 1.5 0 0 2 1 1 0.004081632653061225 0 1",
      "xlm324v2-qnq 0 1e-16 200 0 1.5 0 0 2 1 1 0 0 1",
      "xlm324v2-qpq 0 1e-16 333.3333333333333 0 1.5 0 0 2 1 1 0 0 1",
      "~tl431ed-qn_ed 0 1e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1",
      "~tl431ed-qn_ed-A1.2 0 1.2e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1",
      "~tl431ed-qn_ed-A2.2 0 2.2000000000000002e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1",
      "~tl431ed-qn_ed-A0.5 0 5e-17 0 0 1.5 0 0 2 1 1 0.0125 0.02 1",
      "~tl431ed-qp_ed 0 1e-16 0 0 1.5 0 0 2 1 1 0.014285714285714285 0.025 1",
      "~tl431ed-qn_ed-A5 0 5e-16 0 0 1.5 0 0 2 1 1 0.0125 0.02 1",
      "~lm317-qpl-A0.1 0 1e-17 0 0 1.5 0 0 2 1 1 0.02 0 1",
      "~lm317-qnl-A0.2 0 2e-17 0 0 1.5 0 0 2 1 1 0.01 0 1",
      "~lm317-qpl-A0.2 0 2e-17 0 0 1.5 0 0 2 1 1 0.02 0 1",
      "~lm317-qnl-A2 0 2e-16 0 0 1.5 0 0 2 1 1 0.01 0 1",
      "~lm317-qpl-A2 0 2e-16 0 0 1.5 0 0 2 1 1 0.02 0 1",
      "~lm317-qnl-A5 0 5e-16 0 0 1.5 0 0 2 1 1 0.01 0 1",
      "~lm317-qnl-A50 0 5e-15 0 0 1.5 0 0 2 1 1 0.01 0 1"
    ];
    for (const serialized of internalModels) {
      const model = TransistorModel.undumpModel(
        new StringTokenizer(serialized)
      );
      model.builtIn = true;
      model.internal = true;
    }
  }

  private static addDefaultModel(
    name: string,
    model: TransistorModel
  ): void {
    (TransistorModel.modelMap as Map<string, TransistorModel>).set(
      name,
      model
    );
    model.name = name;
    model.readOnly = true;
    model.builtIn = true;
  }
}
