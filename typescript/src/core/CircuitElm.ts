import { CircuitNode } from "./CircuitNode";
import { Locale } from "./Locale";
import { Point } from "./Point";
import { Rectangle } from "./Rectangle";
import { SimulationManager } from "./SimulationManager";
import type { VoltageSource } from "./VoltageSource";
import { XMLDeserializer } from "./XMLDeserializer";
import { XMLSerializer } from "./XMLSerializer";

/**
 * Portable structural/electrical slice of CircuitElm.java.
 *
 * Canvas drawing methods will be added with the native UI phase. Geometry,
 * serialization, node state and simulation lifecycle names already match Java.
 */
export class CircuitElm {
  public static voltageRange = 5;
  public static readonly colorScaleCount = 201;
  public static currentMult = 1;
  public static powerMult = 1;
  public static readonly pi = 3.14159265358979323846;
  public static readonly SCALE_AUTO = 0;
  public static readonly SCALE_1 = 1;
  public static readonly SCALE_M = 2;
  public static readonly SCALE_MU = 3;
  public static decimalDigits = 3;
  public static shortDecimalDigits = 1;
  public static sim = new SimulationManager();
  public static dcAnalysis = false;

  public x: number;
  public y: number;
  public x2: number;
  public y2: number;
  public flags: number;
  public voltSource: VoltageSource | null = null;
  public nodes: CircuitNode[] = [];
  public dx = 0;
  public dy = 0;
  public dsign = 0;
  public dn = 0;
  public dpx1 = 0;
  public dpy1 = 0;
  public point1 = new Point();
  public point2 = new Point();
  public lead1 = new Point();
  public lead2 = new Point();
  public volts: number[] = [];
  public current = 0;
  public curcount = 0;
  public boundingBox: Rectangle;
  public noDiagonal = false;
  public selected = false;

  public constructor(
    x: number,
    y: number,
    x2 = x,
    y2 = y,
    flags?: number
  ) {
    this.x = x;
    this.y = y;
    this.x2 = x2;
    this.y2 = y2;
    this.flags = flags ?? this.getDefaultFlags();
    this.boundingBox = new Rectangle();
    this.allocNodes();
    this.initBoundingBox();
  }

  public static initClass(simulation: SimulationManager): void {
    CircuitElm.sim = simulation;
  }

  public static setDcAnalysis(enabled: boolean): void {
    CircuitElm.dcAnalysis = enabled;
  }

  public getDumpType(): number {
    return 0;
  }

  public getXmlDumpType(): string {
    const type = this.getDumpType();
    if (type > 64 && type < 127) {
      return String.fromCharCode(type);
    }
    return this.getClassName().replace(/Elm$/, "");
  }

  public getDefaultFlags(): number {
    return 0;
  }

  public hasFlag(flag: number): boolean {
    return (this.flags & flag) !== 0;
  }

  public initBoundingBox(): void {
    this.setBoundingBox(this.x, this.y, this.x2, this.y2);
  }

  public setBoundingBox(x1: number, y1: number, x2: number, y2: number): void {
    if (x1 > x2) [x1, x2] = [x2, x1];
    if (y1 > y2) [y1, y2] = [y2, y1];
    this.boundingBox.setBounds(x1, y1, x2 - x1 + 1, y2 - y1 + 1);
  }

  public setBoundingBoxAroundPoints(point1: Point, point2: Point, width: number): void {
    this.setBoundingBox(point1.x, point1.y, point2.x, point2.y);
    const perpendicularX = Math.trunc(this.dpx1 * width);
    const perpendicularY = Math.trunc(this.dpy1 * width);
    this.adjustBoundingBox(
      point1.x + perpendicularX, point1.y + perpendicularY,
      point1.x - perpendicularX, point1.y - perpendicularY
    );
  }

  public adjustBoundingBox(x1: number, y1: number, x2: number, y2: number): void {
    if (x1 > x2) [x1, x2] = [x2, x1];
    if (y1 > y2) [y1, y2] = [y2, y1];
    x1 = Math.min(this.boundingBox.x, x1);
    y1 = Math.min(this.boundingBox.y, y1);
    x2 = Math.max(this.boundingBox.x + this.boundingBox.width, x2);
    y2 = Math.max(this.boundingBox.y + this.boundingBox.height, y2);
    this.boundingBox.setBounds(x1, y1, x2 - x1, y2 - y1);
  }

  public allocNodes(): void {
    const count = this.getNodeCount();
    if (this.nodes.length !== count) {
      const previousNodes = this.nodes;
      const previousVolts = this.volts;
      this.nodes = Array.from(
        { length: count },
        (_, index) => previousNodes[index] ?? new CircuitNode()
      );
      this.volts = Array.from(
        { length: count },
        (_, index) => previousVolts[index] ?? 0
      );
    }
  }

  public dump(): string {
    const type = this.getDumpType();
    const typeText = type < 127 ? String.fromCharCode(type) : String(type);
    return `${typeText} ${this.x} ${this.y} ${this.x2} ${this.y2} ${this.flags}`;
  }

  public reset(): void {
    this.volts.fill(0);
    this.curcount = 0;
  }

  public preStamp(): void {}

  public setParentList(_elements: CircuitElm[]): void {}

  public stamp(): void {}

  public doStep(): void {}

  public startIteration(): void {}

  public stepFinished(): void {}

  public getPostVoltage(index: number): number {
    return this.volts[index];
  }

  public setNodeVoltage(index: number, voltage: number): void {
    this.volts[index] = voltage;
    this.calculateCurrent();
  }

  public calculateCurrent(): void {}

  public setCurrent(_source: VoltageSource, current: number): void {
    this.current = current;
  }

  public setWireCurrent(_bit: number, current: number): void {
    this.current = current;
  }

  public getCurrent(): number {
    return this.current;
  }

  public setPoints(): void {
    this.dx = this.x2 - this.x;
    this.dy = this.y2 - this.y;
    this.dn = Math.sqrt(this.dx * this.dx + this.dy * this.dy);
    if (this.dn === 0) {
      this.dpx1 = 0;
      this.dpy1 = 0;
    } else {
      this.dpx1 = this.dy / this.dn;
      this.dpy1 = -this.dx / this.dn;
    }
    this.dsign =
      this.dy === 0 ? CircuitElm.sign(this.dx) : CircuitElm.sign(this.dy);
    this.point1 = new Point(this.x, this.y);
    this.point2 = new Point(this.x2, this.y2);
  }

  public calcLeads(length: number): void {
    if (this.dn < length || length === 0) {
      this.lead1 = this.point1;
      this.lead2 = this.point2;
      return;
    }
    this.lead1 = this.interpPoint(
      this.point1,
      this.point2,
      (this.dn - length) / (2 * this.dn)
    );
    this.lead2 = this.interpPoint(
      this.point1,
      this.point2,
      (this.dn + length) / (2 * this.dn)
    );
  }

  public interpPoint(a: Point, b: Point, fraction: number): Point;
  public interpPoint(
    a: Point,
    b: Point,
    fraction: number,
    perpendicular: number
  ): Point;
  public interpPoint(
    a: Point,
    b: Point,
    output: Point,
    fraction: number
  ): void;
  public interpPoint(
    a: Point,
    b: Point,
    output: Point,
    fraction: number,
    perpendicular: number
  ): void;
  public interpPoint(
    a: Point,
    b: Point,
    outputOrFraction: Point | number,
    fractionOrPerpendicular?: number,
    perpendicular = 0
  ): Point | void {
    const output =
      outputOrFraction instanceof Point ? outputOrFraction : new Point();
    const fraction =
      outputOrFraction instanceof Point
        ? (fractionOrPerpendicular ?? 0)
        : outputOrFraction;
    const offset =
      outputOrFraction instanceof Point
        ? perpendicular
        : (fractionOrPerpendicular ?? 0);

    if (offset === 0) {
      output.x = Math.floor(a.x * (1 - fraction) + b.x * fraction + 0.48);
      output.y = Math.floor(a.y * (1 - fraction) + b.y * fraction + 0.48);
    } else {
      const gx = b.y - a.y;
      const gy = a.x - b.x;
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const scaledOffset = magnitude === 0 ? 0 : offset / magnitude;
      output.x = Math.floor(
        a.x * (1 - fraction) +
          b.x * fraction +
          scaledOffset * gx +
          0.48
      );
      output.y = Math.floor(
        a.y * (1 - fraction) +
          b.y * fraction +
          scaledOffset * gy +
          0.48
      );
    }
    if (!(outputOrFraction instanceof Point)) {
      return output;
    }
  }

  public interpPoint2(
    a: Point,
    b: Point,
    first: Point,
    second: Point,
    fraction: number,
    perpendicular: number
  ): void {
    this.interpPoint(a, b, first, fraction, perpendicular);
    this.interpPoint(a, b, second, fraction, -perpendicular);
  }

  public newPointArray(length: number): Point[] {
    return Array.from({ length }, () => new Point());
  }

  public move(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.x2 += dx;
    this.y2 += dy;
    this.boundingBox.translate(dx, dy);
    this.setPoints();
  }

  public creationFailed(): boolean {
    return this.x === this.x2 && this.y === this.y2;
  }

  public setPosition(x: number, y: number, x2: number, y2: number): void {
    this.x = x;
    this.y = y;
    this.x2 = x2;
    this.y2 = y2;
    this.initBoundingBox();
    this.setPoints();
  }

  public movePoint(index: number, dx: number, dy: number): void {
    const old = [this.x, this.y, this.x2, this.y2];
    if (this.noDiagonal) {
      if (this.x === this.x2) {
        dx = 0;
      } else {
        dy = 0;
      }
    }
    if (index === 0) {
      this.x += dx;
      this.y += dy;
    } else {
      this.x2 += dx;
      this.y2 += dy;
    }
    if (this.creationFailed()) {
      [this.x, this.y, this.x2, this.y2] = old;
    }
    this.initBoundingBox();
    this.setPoints();
  }

  public flipX(center2: number, _count = 1): void {
    this.x = center2 - this.x;
    this.x2 = center2 - this.x2;
    this.initBoundingBox();
    this.setPoints();
  }

  public flipY(center2: number, _count = 1): void {
    this.y = center2 - this.y;
    this.y2 = center2 - this.y2;
    this.initBoundingBox();
    this.setPoints();
  }

  public flipXY(xMinusY: number, _count = 1): void {
    const newX = this.y + xMinusY;
    const newY = this.x - xMinusY;
    const newX2 = this.y2 + xMinusY;
    const newY2 = this.x2 - xMinusY;
    this.x = newX;
    this.y = newY;
    this.x2 = newX2;
    this.y2 = newY2;
    this.initBoundingBox();
    this.setPoints();
  }

  public getVoltageSourceCount(): number {
    return 0;
  }

  public getInternalNodeCount(): number {
    return 0;
  }

  public getNodeCount(): number {
    return this.getPostCount() + this.getInternalNodeCount();
  }

  public setNode(index: number, node: CircuitNode): void {
    this.nodes[index] = node;
  }

  public setVoltageSource(_index: number, source: VoltageSource): void {
    this.voltSource = source;
  }

  public getVoltageDiff(): number {
    return this.volts[0] - this.volts[1];
  }

  public nonLinear(): boolean {
    return false;
  }

  public getPostCount(): number {
    return 2;
  }

  public getPostWidth(_index: number): number {
    return 1;
  }

  public getBusWidth(): number {
    return 1;
  }

  public getNode(index: number): CircuitNode {
    return this.nodes[index];
  }

  public getPost(index: number): Point {
    return index === 0 ? this.point1 : this.point2;
  }

  public getConnectedPost(_index = 0): Point | null {
    return this.point2;
  }

  public getNodeAtPoint(point: Point): number {
    for (let index = 0; index < this.getPostCount(); index += 1) {
      if (this.getPost(index).equals(point)) {
        return index;
      }
    }
    return -1;
  }

  public getPower(): number {
    return this.getVoltageDiff() * this.current;
  }

  public getConnection(_n1: number, _n2: number): boolean {
    return true;
  }

  public getMatrixConnection(n1: number, n2: number): boolean {
    return this.getConnection(n1, n2);
  }

  public hasGroundConnection(_node: number): boolean {
    return false;
  }

  public isWireEquivalent(): boolean {
    return false;
  }

  public isRemovableWire(): boolean {
    return false;
  }

  public isIdealCapacitor(): boolean {
    return false;
  }

  public canViewInScope(): boolean {
    return this.getPostCount() <= 2;
  }

  public canFlipX(): boolean {
    return true;
  }

  public canFlipY(): boolean {
    return true;
  }

  public canFlipXY(): boolean {
    return this.canFlipX() || this.canFlipY();
  }

  public comparePair(x1: number, x2: number, y1: number, y2: number): boolean {
    return (x1 === y1 && x2 === y2) || (x1 === y2 && x2 === y1);
  }

  public selectRect(rectangle: Rectangle, add: boolean): void {
    if (rectangle.intersects(this.boundingBox)) {
      this.selected = true;
    } else if (!add) {
      this.selected = false;
    }
  }

  public getBoundingBox(): Rectangle {
    return this.boundingBox;
  }

  public validate(): boolean {
    return true;
  }

  public getCurrentIntoNode(index: number): number {
    return index === 0 && this.getPostCount() === 2
      ? -this.current
      : this.current;
  }

  public flipPosts(): void {
    [this.x, this.x2] = [this.x2, this.x];
    [this.y, this.y2] = [this.y2, this.y];
    this.setPoints();
  }

  public getClassName(): string {
    return this.constructor.name;
  }

  public dumpXml(_document: Document, element: Element): void {
    XMLSerializer.dumpAttr(
      element,
      "x",
      `${this.x} ${this.y} ${this.x2} ${this.y2}`
    );
    XMLSerializer.dumpAttr(element, "f", this.flags);
  }

  public undumpXml(xml: XMLDeserializer): void {
    this.flags = xml.parseIntAttr("f", this.flags);
  }

  public setPositionFromXml(element: Element): void {
    const position = element.getAttribute("x");
    if (position === null) {
      return;
    }
    const values = position.split(" ").map(Number);
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid element position "${position}"`);
    }
    this.setPosition(values[0], values[1], values[2], values[3]);
  }

  public static sign(value: number): number {
    return value < 0 ? -1 : value === 0 ? 0 : 1;
  }

  public static distance(first: Point, second: Point): number {
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  public static getVoltageDText(voltage: number): string {
    return CircuitElm.getUnitText(Math.abs(voltage), "V");
  }

  public static getVoltageText(voltage: number): string {
    return CircuitElm.getUnitText(voltage, "V");
  }

  public static getCurrentText(current: number): string {
    return CircuitElm.getUnitText(current, "A");
  }

  public static getCurrentDText(current: number): string {
    return CircuitElm.getUnitText(Math.abs(current), "A");
  }

  public static getUnitText(value: number, unit: string): string {
    return CircuitElm.formatUnit(value, unit, false);
  }

  public static getShortUnitText(value: number, unit: string): string {
    return CircuitElm.formatUnit(value, unit, true);
  }

  public static getTimeText(value: number): string {
    if (value < 60) {
      return CircuitElm.getUnitText(value, "s");
    }
    const hours = Math.floor(value / 3600);
    value -= 3600 * hours;
    const minutes = Math.floor(value / 60);
    value -= 60 * minutes;
    const seconds = CircuitElm.format(value, false).padStart(2, "0");
    return hours === 0
      ? `${minutes}:${seconds}`
      : `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`;
  }

  public doDcAnalysis(): boolean {
    return CircuitElm.dcAnalysis;
  }

  private static format(value: number, short: boolean): string {
    const digits = short
      ? CircuitElm.shortDecimalDigits
      : CircuitElm.decimalDigits;
    return new Intl.NumberFormat("en-US", {
      useGrouping: false,
      maximumFractionDigits: digits
    }).format(value);
  }

  private static formatUnit(
    value: number,
    unit: string,
    short: boolean
  ): string {
    const space = short ? "" : " ";
    const magnitude = Math.abs(value);
    if (magnitude < 1e-14) {
      return `0${space}${unit}`;
    }

    const ranges: Array<[number, number, string]> = [
      [1e-9, 1e12, "p"],
      [1e-6, 1e9, "n"],
      [1e-3, 1e6, Locale.muString],
      [1, 1e3, "m"],
      [1e3, 1, ""],
      [1e6, 1e-3, "k"],
      [1e9, 1e-6, "M"],
      [1e12, 1e-9, "G"]
    ];
    for (const [upperBound, multiplier, prefix] of ranges) {
      if (magnitude < upperBound) {
        return `${CircuitElm.format(
          value * multiplier,
          short
        )}${space}${prefix}${unit}`;
      }
    }
    return `${value.toExponential(2)}${space}${unit}`;
  }
}
