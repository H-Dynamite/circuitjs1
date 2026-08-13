import { CircuitElm } from "../CircuitElm";
import { Point } from "../Point";

/** Linear four-terminal gyrator using the original admittance equations. */
export class GyratorElm extends CircuitElm {
  public static readonly FLAG_VERTICAL = 8;
  public static readonly FLAG_FLIP = 16;
  public gyrResistance = 1000;
  public width = 32;
  public terminalPoints: Point[] = [];
  public portCurrents = [0, 0];

  public constructor(x: number, y: number) {
    super(x, y);
    this.noDiagonal = true;
  }

  public override getXmlDumpType(): string {
    return "Gyrator";
  }

  public override getPostCount(): number {
    return 4;
  }

  public override setPoints(): void {
    super.setPoints();
    if (this.hasFlag(GyratorElm.FLAG_VERTICAL)) {
      this.point2.x = this.point1.x;
    } else {
      this.point2.y = this.point1.y;
    }
    const flip = this.hasFlag(GyratorElm.FLAG_FLIP) ? -1 : 1;
    const offset = -this.dsign * this.width * flip;
    this.terminalPoints = [
      this.point1,
      this.point2,
      this.interpPoint(this.point1, this.point2, 0, offset),
      this.interpPoint(this.point1, this.point2, 1, offset)
    ];
  }

  public override getPost(index: number): Point {
    return this.terminalPoints[index] ?? this.point1;
  }

  public override stamp(): void {
    const gain = 1 / this.gyrResistance;
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[0],
      this.nodes[2],
      this.nodes[1],
      this.nodes[3],
      gain
    );
    CircuitElm.sim.stampVCCurrentSource(
      this.nodes[1],
      this.nodes[3],
      this.nodes[0],
      this.nodes[2],
      -gain
    );
  }

  public override calculateCurrent(): void {
    const gain = 1 / this.gyrResistance;
    this.portCurrents[0] = gain * (this.volts[1] - this.volts[3]);
    this.portCurrents[1] = -gain * (this.volts[0] - this.volts[2]);
    this.current = this.portCurrents[0];
  }

  public override getCurrentIntoNode(index: number): number {
    return index < 2
      ? -this.portCurrents[index]
      : this.portCurrents[index - 2];
  }

  public override getMatrixConnection(
    _first: number,
    _second: number
  ): boolean {
    return true;
  }

  public override getConnection(first: number, second: number): boolean {
    return (
      this.comparePair(first, second, 0, 2) ||
      this.comparePair(first, second, 1, 3)
    );
  }
}
