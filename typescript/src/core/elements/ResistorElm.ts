import { CircuitElm } from "../CircuitElm";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Electrical and serialization port of ResistorElm.java. */
export class ResistorElm extends CircuitElm {
  public resistance: number;

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
    this.resistance =
      tokenizer === undefined ? 1000 : Number(tokenizer.nextToken());
  }

  public override getDumpType(): number {
    return "r".charCodeAt(0);
  }

  public override dump(): string {
    return `${super.dump()} ${this.resistance}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "r", this.resistance);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.resistance = xml.parseDoubleAttr("r", this.resistance);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
  }

  public override calculateCurrent(): void {
    this.current = (this.volts[0] - this.volts[1]) / this.resistance;
  }

  public override stamp(): void {
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[1],
      this.resistance
    );
  }

  public getResistance(): number {
    return this.resistance;
  }

  public setResistance(resistance: number): void {
    this.resistance = resistance;
  }
}
