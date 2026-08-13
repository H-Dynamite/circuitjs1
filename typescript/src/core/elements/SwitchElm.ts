import { CircuitElm } from "../CircuitElm";
import { CustomLogicModel } from "../CustomLogicModel";
import { StringTokenizer } from "../StringTokenizer";
import { XMLDeserializer } from "../XMLDeserializer";
import { XMLSerializer } from "../XMLSerializer";

/** Topology and state port of the SPST SwitchElm.java. */
export class SwitchElm extends CircuitElm {
  public static readonly FLAG_IEC = 2;
  public static readonly FLAG_LABEL = 4;

  public momentary: boolean;
  /** Position zero is closed; position one is open. */
  public position: number;
  public posCount = 2;
  public label: string | null = null;
  public keyShortcut: string | null = null;
  protected legacyPositionWasBoolean = false;

  public constructor(x: number, y: number);
  public constructor(x: number, y: number, momentary: boolean);
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
    x2OrMomentary: number | boolean = x,
    y2 = y,
    flags = 0,
    tokenizer?: StringTokenizer
  ) {
    const x2 = typeof x2OrMomentary === "number" ? x2OrMomentary : x;
    super(x, y, x2, y2, flags);

    if (typeof x2OrMomentary === "boolean") {
      this.momentary = x2OrMomentary;
      this.position = x2OrMomentary ? 1 : 0;
      return;
    }
    if (tokenizer === undefined) {
      this.momentary = false;
      this.position = 0;
      return;
    }

    const position = tokenizer.nextToken();
    if (position === "true") {
      this.legacyPositionWasBoolean = true;
      this.position = 1;
    } else if (position === "false") {
      this.legacyPositionWasBoolean = true;
      this.position = 0;
    } else {
      this.position = Number.parseInt(position, 10);
    }
    this.momentary =
      tokenizer.hasMoreTokens() &&
      tokenizer.nextToken().toLowerCase() === "true";
    if (
      (this.flags & SwitchElm.FLAG_LABEL) !== 0 &&
      tokenizer.hasMoreTokens()
    ) {
      this.label = CustomLogicModel.unescape(tokenizer.nextToken());
    }
  }

  public override getDumpType(): number {
    return "s".charCodeAt(0);
  }

  public override dump(): string {
    const label =
      this.label === null
        ? ""
        : ` ${CustomLogicModel.escape(this.label)}`;
    return `${super.dump()} ${this.position} ${this.momentary}${label}`;
  }

  public override dumpXml(document: Document, element: Element): void {
    super.dumpXml(document, element);
    if (this.position !== 0) {
      XMLSerializer.dumpAttr(element, "p", this.position);
    }
    if (this.momentary) {
      XMLSerializer.dumpAttr(element, "mm", this.momentary);
    }
    if (this.label !== null) {
      XMLSerializer.dumpAttr(element, "lab", this.label);
    }
    if (this.keyShortcut !== null) {
      XMLSerializer.dumpAttr(element, "key", this.keyShortcut);
    }
  }

  public override undumpXml(xml: XMLDeserializer): void {
    super.undumpXml(xml);
    this.position = xml.parseIntAttr("p", this.position);
    this.momentary = xml.parseBooleanAttr("mm", this.momentary);
    this.label = xml.parseStringAttr("lab", this.label);
    this.keyShortcut = xml.parseStringAttr("key", this.keyShortcut);
  }

  public override setPoints(): void {
    super.setPoints();
    this.calcLeads(32);
  }

  public override calculateCurrent(): void {
    if (this.position === 1) {
      this.current = 0;
    }
  }

  public simpleToggle(): void {
    this.position += 1;
    if (this.position >= this.posCount) {
      this.position = 0;
    }
  }

  public toggle(): void {
    this.simpleToggle();
  }

  public override getConnection(_n1: number, _n2: number): boolean {
    return this.position === 0;
  }

  public override isWireEquivalent(): boolean {
    return this.position === 0;
  }

  public override isRemovableWire(): boolean {
    return this.position === 0;
  }

  public useIECSymbol(): boolean {
    return (this.flags & SwitchElm.FLAG_IEC) !== 0;
  }
}
