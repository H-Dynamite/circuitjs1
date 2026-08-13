import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Three-terminal potentiometer with a normalized slider position. */
export class PotElm extends CircuitElm {
  public static readonly FLAG_SHOW_VALUES = 1;
  public static readonly FLAG_FLIP = 2;
  public static readonly FLAG_FLIP_OFFSET = 4;

  public position = 0.5;
  public maxResistance = 1000;
  public resistance1 = 500;
  public resistance2 = 500;
  public current1 = 0;
  public current2 = 0;
  public current3 = 0;
  public curcount1 = 0;
  public curcount2 = 0;
  public curcount3 = 0;
  public sliderText = "Resistance";
  public link = 0;
  public post3 = new Point();
  public corner2 = new Point();
  public arrowPoint = new Point();
  public midpoint = new Point();

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
    flags = PotElm.FLAG_SHOW_VALUES,
    tokenizer?: StringTokenizer
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.maxResistance = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      const value = Number(tokenizer.nextToken());
      if (Number.isFinite(value)) this.position = value;
    }
    if (tokenizer?.hasMoreTokens()) {
      this.sliderText = tokenizer.toArray().join(" ");
    }
    this.position = Math.max(0.005, Math.min(0.995, this.position));
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 174;
  }

  public override getXmlDumpType(): string {
    return "pt";
  }

  public override dump(): string {
    return (
      `${super.dump()} ${this.maxResistance} ${this.position} ` +
      `${this.sliderText}`
    );
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "ma", this.maxResistance);
    XMLSerializer.dumpAttr(element, "po", this.position);
    XMLSerializer.dumpAttr(element, "sl", this.sliderText);
    if (this.link !== 0) {
      XMLSerializer.dumpAttr(element, "li", this.link);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.maxResistance = xml.parseDoubleAttr(
      "ma",
      this.maxResistance
    );
    this.position = xml.parseDoubleAttr("po", this.position);
    this.sliderText =
      xml.parseStringAttr("sl", this.sliderText) ?? this.sliderText;
    this.link = xml.parseIntAttr("li", this.link);
  }

  public override getPostCount(): number {
    return 3;
  }

  public override getPost(index: number): Point {
    return index === 0
      ? this.point1
      : index === 1
        ? this.point2
        : this.post3;
  }

  public override setPoints(): void {
    super.setPoints();
    const gridSize = 16;
    let offset = 0;
    if (
      (Math.abs(this.dx) > Math.abs(this.dy)) !==
      this.hasFlag(PotElm.FLAG_FLIP)
    ) {
      const length =
        2 *
        gridSize *
        Math.sign(this.dx) *
        Math.ceil(Math.abs(this.dx) / (2 * gridSize));
      this.point2.x = this.point1.x + length;
      this.point2.y = this.point1.y;
      offset = this.dx < 0 ? this.dy : -this.dy;
    } else if (this.dy !== 0) {
      const length =
        2 *
        gridSize *
        Math.sign(this.dy) *
        Math.ceil(Math.abs(this.dy) / (2 * gridSize));
      this.point2.x = this.point1.x;
      this.point2.y = this.point1.y + length;
      offset = this.dy > 0 ? this.dx : -this.dx;
    }
    if (offset === 0) {
      offset = this.hasFlag(PotElm.FLAG_FLIP_OFFSET)
        ? -gridSize
        : gridSize;
    }
    this.dn = Math.hypot(
      this.point2.x - this.point1.x,
      this.point2.y - this.point1.y
    );
    this.calcLeads(32);
    const denominator = Math.max(this.dn, 1);
    const sliderFraction =
      0.5 + ((this.position - 0.5) * 32) / denominator;
    this.post3 = this.interpPoint(
      this.point1,
      this.point2,
      0.5,
      offset
    );
    this.corner2 = this.interpPoint(
      this.point1,
      this.point2,
      sliderFraction,
      offset
    );
    this.arrowPoint = this.interpPoint(
      this.point1,
      this.point2,
      sliderFraction,
      8 * Math.sign(offset)
    );
    this.midpoint = this.interpPoint(
      this.point1,
      this.point2,
      sliderFraction
    );
  }

  public setSliderPosition(position: number): void {
    this.position = Math.max(0.005, Math.min(0.995, position));
    this.setPoints();
  }

  public override stamp(): void {
    this.resistance1 = this.maxResistance * this.position;
    this.resistance2 =
      this.maxResistance * (1 - this.position);
    CircuitElm.sim.stampResistor(
      this.nodes[0],
      this.nodes[2],
      this.resistance1
    );
    CircuitElm.sim.stampResistor(
      this.nodes[2],
      this.nodes[1],
      this.resistance2
    );
  }

  public override calculateCurrent(): void {
    this.current1 =
      (this.volts[0] - this.volts[2]) / this.resistance1;
    this.current2 =
      (this.volts[1] - this.volts[2]) / this.resistance2;
    this.current3 = -this.current1 - this.current2;
  }

  public override reset(): void {
    super.reset();
    this.curcount1 = 0;
    this.curcount2 = 0;
    this.curcount3 = 0;
  }

  public override getCurrentIntoNode(node: number): number {
    return node === 0
      ? -this.current1
      : node === 1
        ? -this.current2
        : -this.current3;
  }
}
