import { StringTokenizer } from "./StringTokenizer";
import { XMLDeserializer } from "./XMLDeserializer";

/** Runtime custom-logic model and encoding behavior from CustomLogicModel.java. */
export class CustomLogicModel {
  private static readonly models = new Map<string, CustomLogicModel>();

  public flags = 0;
  public name = "default";
  public inputs = ["A", "B"];
  public outputs = ["C", "D"];
  public infoText = "custom logic";
  public rules = "";
  public rulesLeft: string[] = [];
  public rulesRight: string[] = [];
  public triState = false;

  public static getModelWithName(name: string): CustomLogicModel {
    const existing = CustomLogicModel.models.get(name);
    if (existing !== undefined) return existing;
    const model = new CustomLogicModel();
    model.name = name;
    model.infoText = name === "default" ? "custom logic" : name;
    CustomLogicModel.models.set(name, model);
    return model;
  }

  public static getModelWithNameOrCopy(
    name: string,
    source: CustomLogicModel
  ): CustomLogicModel {
    const existing = CustomLogicModel.models.get(name);
    if (existing !== undefined) return existing;
    const model = new CustomLogicModel();
    model.flags = source.flags;
    model.name = name;
    model.inputs = [...source.inputs];
    model.outputs = [...source.outputs];
    model.infoText = name;
    model.rules = source.rules;
    model.rulesLeft = [...source.rulesLeft];
    model.rulesRight = [...source.rulesRight];
    model.triState = source.triState;
    CustomLogicModel.models.set(name, model);
    return model;
  }

  public static undumpModel(tokenizer: StringTokenizer): void {
    if (!tokenizer.hasMoreTokens()) return;
    const name = CustomLogicModel.unescape(tokenizer.nextToken());
    const model = CustomLogicModel.getModelWithName(name);
    model.flags = Number.parseInt(tokenizer.nextToken(), 10) || 0;
    model.inputs = CustomLogicModel.listToArray(
      CustomLogicModel.unescape(tokenizer.nextToken())
    );
    model.outputs = CustomLogicModel.listToArray(
      CustomLogicModel.unescape(tokenizer.nextToken())
    );
    model.infoText = CustomLogicModel.unescape(tokenizer.nextToken());
    model.rules = CustomLogicModel.unescape(tokenizer.nextToken());
    model.parseRules();
  }

  public static undumpModelXml(xml: XMLDeserializer): void {
    const name = xml.parseStringAttr("nm", "default") ?? "default";
    const model = CustomLogicModel.getModelWithName(name);
    model.flags = xml.parseIntAttr("f", model.flags);
    model.inputs = CustomLogicModel.listToArray(
      xml.parseStringAttr("in", "") ?? ""
    );
    model.outputs = CustomLogicModel.listToArray(
      xml.parseStringAttr("o", "") ?? ""
    );
    model.infoText =
      xml.parseStringAttr("if", model.infoText) ?? model.infoText;
    model.rules = (xml.parseContents() ?? "").trim();
    model.parseRules();
  }

  public parseRules(): void {
    this.rulesLeft = [];
    this.rulesRight = [];
    this.triState = false;
    for (const sourceLine of this.rules.split(/\r?\n/)) {
      const line = sourceLine.toLowerCase().trim();
      if (line.length === 0 || line.startsWith("#")) continue;
      const sides = line.replace(/\s/g, "").split("=");
      if (
        sides.length !== 2 ||
        sides[0].length < this.inputs.length ||
        sides[0].length > this.inputs.length + this.outputs.length ||
        sides[1].length !== this.outputs.length
      ) {
        continue;
      }
      const used = Array<boolean>(26).fill(false);
      let normalized = "";
      for (const character of sides[0]) {
        if ("?+-01".includes(character)) {
          normalized += character;
          continue;
        }
        const index = character.charCodeAt(0) - 97;
        if (index < 0 || index >= 26) {
          normalized = "";
          break;
        }
        normalized += used[index]
          ? character.toUpperCase()
          : character;
        used[index] = true;
      }
      if (normalized.length === 0) continue;
      this.rulesLeft.push(normalized);
      this.rulesRight.push(sides[1]);
      if (sides[1].includes("_")) this.triState = true;
    }
  }

  private static listToArray(value: string): string[] {
    return value.length === 0 ? [] : value.split(",");
  }

  public static escape(value: string): string {
    if (value.length === 0) {
      return "\\0";
    }
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/ /g, "\\s")
      .replace(/\+/g, "\\p")
      .replace(/=/g, "\\q")
      .replace(/#/g, "\\h")
      .replace(/&/g, "\\a")
      .replace(/\r/g, "\\r");
  }

  public static unescape(value: string): string {
    if (value === "\\0") {
      return "";
    }

    let result = "";
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (character !== "\\" || index + 1 >= value.length) {
        result += character;
        continue;
      }

      index += 1;
      const escaped = value[index];
      const replacements: Record<string, string> = {
        n: "\n",
        r: "\r",
        s: " ",
        p: "+",
        q: "=",
        h: "#",
        a: "&",
        "\\": "\\"
      };
      result += replacements[escaped] ?? escaped;
    }
    return result;
  }
}
