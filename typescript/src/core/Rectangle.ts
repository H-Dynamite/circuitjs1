import { Point } from "./Point";

/** Direct TypeScript port of client/Rectangle.java. */
export class Rectangle {
  public x: number;
  public y: number;
  public width: number;
  public height: number;

  public constructor();
  public constructor(rectangle: Rectangle);
  public constructor(point: Point);
  public constructor(x: number, y: number, width: number, height: number);
  public constructor(
    xOrValue: number | Point | Rectangle = 0,
    y = 0,
    width = 0,
    height = 0
  ) {
    if (xOrValue instanceof Point) {
      this.x = xOrValue.x;
      this.y = xOrValue.y;
      this.width = 0;
      this.height = 0;
    } else if (xOrValue instanceof Rectangle) {
      this.x = xOrValue.x;
      this.y = xOrValue.y;
      this.width = xOrValue.width;
      this.height = xOrValue.height;
    } else {
      this.x = xOrValue;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  }

  public setBounds(x: number, y: number, width: number, height: number): void {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  public translate(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  public contains(x: number, y: number): boolean;
  public contains(rectangle: Rectangle): boolean;
  public contains(xOrRectangle: number | Rectangle, y?: number): boolean {
    if (xOrRectangle instanceof Rectangle) {
      return (
        this.contains(xOrRectangle.x, xOrRectangle.y) &&
        this.contains(
          xOrRectangle.x + xOrRectangle.width,
          xOrRectangle.y + xOrRectangle.height
        )
      );
    }

    const x = xOrRectangle;
    const targetY = y ?? 0;
    const right = this.width + this.x;
    const bottom = this.height + this.y;

    if (this.width < 0 || this.height < 0) {
      return false;
    }
    if (x < this.x || targetY < this.y) {
      return false;
    }
    return right > x && bottom > targetY;
  }

  public intersects(rectangle: Rectangle): boolean {
    if (
      rectangle.width <= 0 ||
      rectangle.height <= 0 ||
      this.width <= 0 ||
      this.height <= 0
    ) {
      return false;
    }

    return (
      rectangle.x + rectangle.width > this.x &&
      rectangle.y + rectangle.height > this.y &&
      this.x + this.width > rectangle.x &&
      this.y + this.height > rectangle.y
    );
  }

  public union(rectangle: Rectangle): Rectangle {
    if (this.width < 0 || this.height < 0) {
      return new Rectangle(rectangle);
    }
    if (rectangle.width < 0 || rectangle.height < 0) {
      return new Rectangle(this);
    }

    const x = Math.min(this.x, rectangle.x);
    const y = Math.min(this.y, rectangle.y);
    const right = Math.max(
      this.x + this.width,
      rectangle.x + rectangle.width
    );
    const bottom = Math.max(
      this.y + this.height,
      rectangle.y + rectangle.height
    );
    return new Rectangle(x, y, right - x, bottom - y);
  }

  public toString(): string {
    return `Rect(${this.x},${this.y},${this.width},${this.height})`;
  }

  public equals(other: unknown): boolean {
    return (
      other instanceof Rectangle &&
      this.x === other.x &&
      this.y === other.y &&
      this.width === other.width &&
      this.height === other.height
    );
  }
}
