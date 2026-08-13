import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";
import { StringTokenizer } from "../StringTokenizer";
import { VoltageSource } from "../VoltageSource";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Four-terminal instantaneous/average power meter. */
export class WattmeterElm extends CircuitElm {
  public width = 32;
  public voltageSources: Array<VoltageSource | null> = [null, null];
  public currents = [0, 0];
  public meter = 0;
  public avgPower = 0;
  public totalPower = 0;
  public count = 0;
  public posts: Point[] = [];
  public inner: Point[] = [];

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
    tokenizer = new StringTokenizer("")
  ) {
    super(x, y, x2, y2, flags);
    if (tokenizer.hasMoreTokens()) {
      this.width = Number.parseInt(tokenizer.nextToken(), 10) || 32;
    }
    if (tokenizer.hasMoreTokens()) {
      this.meter = Number.parseInt(tokenizer.nextToken(), 10) || 0;
    }
    this.allocNodes();
  }

  public override getDumpType(): number {
    return 420;
  }

  public override getPostCount(): number {
    return 4;
  }

  public override getVoltageSourceCount(): number {
    return 2;
  }

  public override setPoints(): void {
    super.setPoints();
    const sign = this.dy === 0 ? Math.sign(this.dx) : -Math.sign(this.dy);
    const distance = this.dn || 1;
    const third = this.interpPoint(
      this.point1,
      this.point2,
      0,
      -this.width * sign
    );
    const fourth = this.interpPoint(
      this.point1,
      this.point2,
      1,
      -this.width * sign
    );
    const separation = 16;
    this.posts = [third, fourth, this.point1, this.point2];
    this.inner = [
      this.interpPoint(third, fourth, separation / distance),
      this.interpPoint(third, fourth, 1 - separation / distance),
      this.interpPoint(
        this.point1,
        this.point2,
        separation / distance
      ),
      this.interpPoint(
        this.point1,
        this.point2,
        1 - separation / distance
      )
    ];
  }

  public override getPost(index: number): Point {
    return this.posts[index] ?? this.point1;
  }

  public override setVoltageSource(
    index: number,
    source: VoltageSource
  ): void {
    this.voltageSources[index] = source;
    source.setNodes(this.nodes[index * 2], this.nodes[index * 2 + 1]);
  }

  public override stamp(): void {
    for (let index = 0; index < 2; index += 1) {
      const source = this.voltageSources[index];
      if (source === null) {
        throw new Error("Wattmeter source is unassigned");
      }
      CircuitElm.sim.stampVoltageSource(
        this.nodes[index * 2],
        this.nodes[index * 2 + 1],
        source,
        0
      );
    }
  }

  public override setCurrent(
    source: VoltageSource,
    current: number
  ): void {
    this.currents[source === this.voltageSources[0] ? 0 : 1] =
      current;
  }

  public override getCurrent(): number {
    return this.currents[1];
  }

  public override getVoltageDiff(): number {
    return this.volts[2] - this.volts[0];
  }

  public override getPower(): number {
    return this.getVoltageDiff() * this.getCurrent();
  }

  public override stepFinished(): void {
    this.count += 1;
    this.totalPower += this.getPower();
    this.avgPower = this.totalPower / this.count;
  }

  public override getCurrentIntoNode(index: number): number {
    return index % 2 === 0
      ? -this.currents[Math.floor(index / 2)]
      : this.currents[Math.floor(index / 2)];
  }

  public override getConnection(first: number, second: number): boolean {
    return Math.floor(first / 2) === Math.floor(second / 2);
  }

  public override canViewInScope(): boolean {
    return true;
  }

  public override dump(): string {
    return `${super.dump()} ${this.width} ${this.meter}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    XMLSerializer.dumpAttr(element, "w", this.width);
    XMLSerializer.dumpAttr(element, "meter", this.meter);
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.width = xml.parseIntAttr("w", this.width);
    this.meter = xml.parseIntAttr("meter", this.meter);
  }
}
