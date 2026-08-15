import { CircuitElm } from "../CircuitElm";
import { CircuitNode } from "../CircuitNode";
import { CustomLogicModel } from "../CustomLogicModel";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { ChipElm, ChipPin } from "./ChipElm";

/** Rule-table digital component ported from CustomLogicElm.java. */
export class CustomLogicElm extends ChipElm {
  public static lastModelName = "default";
  public modelName = "default";
  public model = CustomLogicModel.getModelWithName("default");
  public inputCount = 0;
  public outputCount = 0;
  private postCount = 0;
  private lastValues: boolean[] = [];
  private patternValues = Array<boolean>(26).fill(false);
  private highImpedance: boolean[] = [];

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
      this.modelName = CustomLogicModel.unescape(tokens.nextToken());
    } else if (tokenizer === undefined) {
      this.modelName = CustomLogicElm.lastModelName;
    }
    this.model = CustomLogicModel.getModelWithName(this.modelName);
    this.setupPins();
    for (let index = this.inputCount; index < this.postCount; index += 1) {
      if (tokens.hasMoreTokens()) {
        const voltage = Number(tokens.nextToken());
        if (Number.isFinite(voltage)) {
          this.volts[index] = voltage;
          this.pins[index].value = voltage > this.getThreshold();
        }
      }
    }
  }

  public override setupPins(): void {
    const model =
      this.model ??
      CustomLogicModel.getModelWithName(this.modelName ?? "default");
    this.model = model;
    this.inputCount = model.inputs.length;
    this.outputCount = model.outputs.length;
    this.sizeY = Math.max(this.inputCount, this.outputCount, 1);
    this.sizeX = 2;
    this.postCount = this.inputCount + this.outputCount;
    this.pins = Array<ChipPin>(this.postCount);
    for (let index = 0; index < this.inputCount; index += 1) {
      this.pins[index] = new ChipPin(
        index,
        ChipElm.SIDE_W,
        model.inputs[index]
      );
    }
    for (let index = 0; index < this.outputCount; index += 1) {
      const pinIndex = this.inputCount + index;
      this.pins[pinIndex] = new ChipPin(
        index,
        ChipElm.SIDE_E,
        model.outputs[index]
      );
      this.pins[pinIndex].output = true;
    }
    this.lastValues = Array(this.postCount).fill(false);
    this.patternValues = Array(26).fill(false);
    this.highImpedance = Array(this.postCount).fill(false);
    this.allocNodes();
  }

  public override getPostCount(): number {
    return this.postCount || this.bits || 0;
  }

  public override getVoltageSourceCount(): number {
    return this.outputCount;
  }

  public override getInternalNodeCount(): number {
    return this.model?.triState ? this.outputCount : 0;
  }

  public override getChipName(): string {
    return this.model?.infoText ?? "custom logic";
  }

  public override getDumpType(): number {
    return 208;
  }

  public override getXmlDumpType(): string {
    return "cl";
  }

  public override nonLinear(): boolean {
    return this.model.triState;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    super.setVoltageSource(index, source);
    if (this.model.triState) {
      source.setNodes(
        CircuitNode.ground,
        this.nodes[this.postCount + index]
      );
    }
  }

  public override stamp(): void {
    for (let output = 0; output < this.outputCount; output += 1) {
      const pinIndex = this.inputCount + output;
      const source = this.requireOutputSource(pinIndex);
      const sourceNode = this.model.triState
        ? this.postCount + output
        : pinIndex;
      CircuitElm.sim.stampVoltageSource(
        CircuitNode.ground,
        this.nodes[sourceNode],
        source
      );
      if (this.model.triState) {
        CircuitElm.sim.stampNonLinear(this.nodes[sourceNode]);
        CircuitElm.sim.stampNonLinear(this.nodes[pinIndex]);
      }
    }
  }

  public override doStep(): void {
    for (let index = 0; index < this.inputCount; index += 1) {
      this.pins[index].value =
        this.volts[index] > this.getThreshold();
    }
    this.executeRules();
    for (let output = 0; output < this.outputCount; output += 1) {
      const pinIndex = this.inputCount + output;
      const sourceNode = this.model.triState
        ? this.postCount + output
        : pinIndex;
      CircuitElm.sim.updateVoltageSource(
        CircuitNode.ground,
        this.nodes[sourceNode],
        this.requireOutputSource(pinIndex),
        this.pins[pinIndex].value ? this.highVoltage : 0
      );
      if (this.model.triState) {
        CircuitElm.sim.stampResistor(
          this.nodes[sourceNode],
          this.nodes[pinIndex],
          this.highImpedance[pinIndex] ? 1e8 : 1e-3
        );
      }
    }
  }

  private executeRules(): void {
    for (let rule = 0; rule < this.model.rulesLeft.length; rule += 1) {
      const left = this.model.rulesLeft[rule];
      let matches = true;
      for (let index = 0; index < left.length; index += 1) {
        const pattern = left[index];
        const value = this.pins[index].value;
        if (pattern === "?" || (pattern === "1") === value &&
          (pattern === "0" || pattern === "1")) {
          continue;
        }
        if (pattern === "+" && value && !this.lastValues[index]) continue;
        if (pattern === "-" && !value && this.lastValues[index]) continue;
        if (/[a-z]/.test(pattern)) {
          this.patternValues[pattern.charCodeAt(0) - 97] = value;
          continue;
        }
        if (/[A-Z]/.test(pattern)) {
          if (
            this.patternValues[pattern.charCodeAt(0) - 65] === value
          ) {
            continue;
          }
        }
        matches = false;
        break;
      }
      if (!matches) continue;
      const right = this.model.rulesRight[rule];
      for (let index = 0; index < right.length; index += 1) {
        const pinIndex = this.inputCount + index;
        const result = right[index];
        this.highImpedance[pinIndex] = result === "_";
        if (/[a-z]/.test(result)) {
          this.pins[pinIndex].value =
            this.patternValues[result.charCodeAt(0) - 97];
        } else if (result !== "_") {
          this.pins[pinIndex].value = result === "1";
        }
      }
      break;
    }
    for (let index = 0; index < this.postCount; index += 1) {
      this.lastValues[index] = this.pins[index].value;
    }
  }

  public override getMatrixConnection(
    first: number,
    second: number
  ): boolean {
    if (!this.model.triState) return super.getMatrixConnection(first, second);
    for (let output = 0; output < this.outputCount; output += 1) {
      if (
        this.comparePair(
          first,
          second,
          this.inputCount + output,
          this.postCount + output
        )
      ) {
        return true;
      }
    }
    return false;
  }

  public override dump(): string {
    return `${super.dump()} ${CustomLogicModel.escape(this.modelName)}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "mo", this.modelName);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.modelName =
      xml.parseStringAttr("mo", this.modelName) ?? this.modelName;
    this.model = CustomLogicModel.getModelWithName(this.modelName);
    this.setupPins();
  }

  private requireOutputSource(pinIndex: number): VoltageSource {
    const source = this.pins[pinIndex].voltSource;
    if (source === null) {
      throw new Error(`Custom logic output ${pinIndex} is unassigned`);
    }
    return source;
  }
}
