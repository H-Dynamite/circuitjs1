/** Direct TypeScript port of client/Point.java. */
export class Point {
  public x: number;
  public y: number;
  public z: number;

  public constructor();
  public constructor(point: Point);
  public constructor(x: number, y: number, z?: number);
  public constructor(
    xOrPoint: number | Point = 0,
    y = 0,
    z = 0
  ) {
    if (xOrPoint instanceof Point) {
      this.x = xOrPoint.x;
      this.y = xOrPoint.y;
      this.z = xOrPoint.z;
    } else {
      this.x = xOrPoint;
      this.y = y;
      this.z = z;
    }
  }

  public setLocation(point: Point): void {
    this.x = point.x;
    this.y = point.y;
    this.z = point.z;
  }

  public toString(): string {
    return this.z !== 0
      ? `Point(${this.x},${this.y},${this.z})`
      : `Point(${this.x},${this.y})`;
  }

  public equals(other: unknown): boolean {
    return (
      other instanceof Point &&
      this.x === other.x &&
      this.y === other.y &&
      this.z === other.z
    );
  }

  public hashCode(): number {
    return 41 * (41 * (41 + this.x) + this.y) + this.z;
  }

  public move(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }
}
