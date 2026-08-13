import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";
import { RelayContactElm } from "./RelayContactElm";

/** Three-pole I²t motor protection switch. */
export class MotorProtectionSwitchElm extends CircuitElm {
  public resistance = 0.0613;
  public i2t = 6.73;
  public blown = false;
  public label = "";
  public heats = [0, 0, 0];
  public currents = [0, 0, 0];
  private posts: Point[] = [];
  private parentElements: CircuitElm[] = [];

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
    if (tokenizer?.hasMoreTokens()) {
      this.resistance = Number(tokenizer.nextToken());
      this.i2t = Number(tokenizer.nextToken());
      this.blown = tokenizer.nextToken() === "true";
      if (tokenizer.hasMoreTokens()) {
        this.label = CustomLogicModel.unescape(tokenizer.nextToken());
      }
    }
  }

  public override getDumpType(): number {
    return 428;
  }

  public override getPostCount(): number {
    return 6;
  }

  public override setParentList(elements: CircuitElm[]): void {
    this.parentElements = elements;
  }

  public override setPoints(): void {
    super.setPoints();
    this.posts = [];
    for (let phase = 0; phase < 3; phase += 1) {
      this.posts.push(
        new Point(this.x + phase * 48, this.y),
        new Point(this.x + phase * 48, this.y + 192)
      );
    }
  }

  public override getPost(index: number): Point {
    return this.posts[index] ?? this.point1;
  }

  public override reset(): void {
    super.reset();
    this.heats.fill(0);
    this.currents.fill(0);
    this.blown = false;
    this.updateLinkedContacts();
  }

  public override nonLinear(): boolean {
    return true;
  }

  public override stamp(): void {
    for (const node of this.nodes) CircuitElm.sim.stampNonLinear(node);
  }

  public override startIteration(): void {
    const wasBlown = this.blown;
    for (let phase = 0; phase < 3; phase += 1) {
      let heat =
        this.heats[phase] +
        this.currents[phase] *
          this.currents[phase] *
          CircuitElm.sim.timeStep;
      heat -= CircuitElm.sim.timeStep * this.i2t / 3;
      heat = Math.max(0, heat);
      if (heat > this.i2t) this.blown = true;
      this.heats[phase] = heat;
    }
    if (this.blown !== wasBlown) this.updateLinkedContacts();
  }

  public override doStep(): void {
    const resistance = this.blown ? 1e9 : this.resistance;
    for (let phase = 0; phase < 3; phase += 1) {
      CircuitElm.sim.stampResistor(
        this.nodes[phase * 2],
        this.nodes[phase * 2 + 1],
        resistance
      );
    }
  }

  public override calculateCurrent(): void {
    const resistance = this.blown ? 1e9 : this.resistance;
    for (let phase = 0; phase < 3; phase += 1) {
      this.currents[phase] =
        (this.volts[phase * 2] - this.volts[phase * 2 + 1]) /
        resistance;
    }
  }

  public override getConnection(first: number, second: number): boolean {
    return Math.floor(first / 2) === Math.floor(second / 2);
  }

  public override getCurrentIntoNode(index: number): number {
    const current = this.currents[Math.floor(index / 2)];
    return index % 2 === 0 ? -current : current;
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.resistance} ${this.i2t} ${this.blown} ` +
      `${CustomLogicModel.escape(this.label)}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "re", this.resistance);
    XMLSerializer.dumpAttr(element, "i2", this.i2t);
    XMLSerializer.dumpAttr(element, "bl", this.blown);
    XMLSerializer.dumpAttr(element, "la", this.label);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.resistance = xml.parseDoubleAttr("re", this.resistance);
    this.i2t = xml.parseDoubleAttr("i2", this.i2t);
    this.blown = xml.parseBooleanAttr("bl", this.blown);
    this.label = xml.parseStringAttr("la", this.label) ?? this.label;
  }

  private updateLinkedContacts(): void {
    const position = this.blown ? 0 : 1;
    for (const element of this.parentElements) {
      if (
        element instanceof RelayContactElm &&
        element.label === this.label
      ) {
        element.setRelayPosition(position, 0);
      }
    }
  }
}
