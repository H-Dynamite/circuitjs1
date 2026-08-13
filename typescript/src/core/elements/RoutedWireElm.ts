import { Point } from "../Point";
import { XMLDeserializer } from "../XMLDeserializer";
import { WireElm } from "./WireElm";

/** Orthogonal wire path used by the XML circuit format. */
export class RoutedWireElm extends WireElm {
  public routePoints: Point[] = [];

  public constructor(x: number, y: number) {
    super(x, y);
  }

  public override getDumpType(): number {
    return 0;
  }

  public override getXmlDumpType(): string {
    return "rw";
  }

  public override dump(): string {
    return `w ${this.x} ${this.y} ${this.x2} ${this.y2} ${this.flags}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    if (this.routePoints.length >= 2) {
      element.append(
        document.createTextNode(
          this.routePoints
            .map((point) => `${point.x},${point.y}`)
            .join(";")
        )
      );
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    const contents = xml.parseContents();
    if (contents === null || contents.trim().length === 0) {
      return;
    }
    const points = contents.split(";").map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return new Point(x, y);
    });
    if (
      points.length >= 2 &&
      points.every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
      )
    ) {
      this.routePoints = points;
    }
  }

  public override setPoints(): void {
    super.setPoints();
    if (this.routePoints.length < 2) {
      this.routePoints = [
        this.point1,
        new Point(this.x2, this.y),
        this.point2
      ];
    } else {
      this.routePoints[0] = this.point1;
      this.routePoints[this.routePoints.length - 1] = this.point2;
    }
  }
}
