export interface XmlRecord {
  tagName: string;
  attributes: Record<string, string>;
  contents: string | null;
  children: XmlRecord[];
  kind:
    | "element"
    | "scope"
    | "model"
    | "hint"
    | "adjustable"
    | "test"
    | "unknown";
}

export interface XmlCircuitOptions {
  flags: number;
  maxTimeStep: number | null;
  iterationSpeed: number | null;
  currentSpeed: number | null;
  powerBrightness: number | null;
  voltageRange: number | null;
  minTimeStep: number | null;
  solverType: number | null;
}

export interface ParsedXmlCircuit {
  format: "xml";
  options: XmlCircuitOptions;
  records: XmlRecord[];
  source: string;
}

/**
 * DOM-based portable slice of XMLDeserializer.java.
 * Element construction remains a later migration phase.
 */
export class XMLDeserializer {
  public currentXmlElement: Element | null = null;

  public readCircuit(text: string): ParsedXmlCircuit {
    const document = new DOMParser().parseFromString(text, "application/xml");
    const parseError = document.querySelector("parsererror");
    if (parseError !== null) {
      throw new Error(`Invalid circuit XML: ${parseError.textContent ?? ""}`);
    }

    const root = document.documentElement;
    if (root.tagName !== "cir") {
      throw new Error(`Invalid circuit root <${root.tagName}>`);
    }
    this.currentXmlElement = root;

    return {
      format: "xml",
      options: {
        flags: this.parseIntAttr("f", 0),
        maxTimeStep: this.parseOptionalNumber("ts"),
        iterationSpeed: this.parseOptionalNumber("ic"),
        currentSpeed: this.parseOptionalInteger("cb"),
        powerBrightness: this.parseOptionalInteger("pb"),
        voltageRange: this.parseOptionalNumber("vr"),
        minTimeStep: this.parseOptionalNumber("mts"),
        solverType: this.parseOptionalInteger("st")
      },
      records: this.readElements(root),
      source: text
    };
  }

  public readElements(root: Element): XmlRecord[] {
    return Array.from(root.children, (element) => this.elementToRecord(element));
  }

  public parseDoubleAttr(attribute: string, defaultValue: number): number {
    const value = this.getAttribute(attribute);
    if (value === null) {
      return defaultValue;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid numeric attribute ${attribute}="${value}"`);
    }
    return parsed;
  }

  public parseIntAttr(attribute: string, defaultValue: number): number {
    const value = this.getAttribute(attribute);
    if (value === null) {
      return defaultValue;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid integer attribute ${attribute}="${value}"`);
    }
    return parsed;
  }

  public parseBooleanAttr(
    attribute: string,
    defaultValue: boolean
  ): boolean {
    const value = this.getAttribute(attribute);
    return value === null ? defaultValue : value.toLowerCase() === "true";
  }

  public parseStringAttr(
    attribute: string,
    defaultValue: string | null
  ): string | null {
    const value = this.getAttribute(attribute);
    if (value === null) {
      return defaultValue;
    }
    return value
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  public parseContents(): string | null {
    return this.currentXmlElement?.firstChild?.nodeValue ?? null;
  }

  public parseDoubleArray(text: string | null): number[] {
    if (text === null || text.trim().length === 0) {
      return [];
    }
    return text.split(",").map((part) => {
      const value = Number(part.trim());
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number "${part}" in numeric array`);
      }
      return value;
    });
  }

  public getChildElements(): Element[] {
    return this.currentXmlElement === null
      ? []
      : Array.from(this.currentXmlElement.children);
  }

  public parseChildElement(element: Element): void {
    this.currentXmlElement = element;
  }

  private elementToRecord(element: Element): XmlRecord {
    this.currentXmlElement = element;
    const attributes: Record<string, string> = {};
    for (const attribute of Array.from(element.attributes)) {
      attributes[attribute.name] = attribute.value;
    }

    const modelTags = new Set(["dm", "rlm", "tm", "clm", "ccm"]);
    let kind: XmlRecord["kind"] = "unknown";
    if (element.tagName === "o") {
      kind = "scope";
    } else if (modelTags.has(element.tagName)) {
      kind = "model";
    } else if (element.tagName === "h") {
      kind = "hint";
    } else if (element.tagName === "adj") {
      kind = "adjustable";
    } else if (
      element.tagName === "test" ||
      element.tagName === "switchevent" ||
      element.tagName === "scopedata"
    ) {
      kind = "test";
    } else if (element.hasAttribute("x")) {
      kind = "element";
    }

    return {
      tagName: element.tagName,
      attributes,
      contents: element.firstChild?.nodeValue ?? null,
      children: Array.from(element.children, (child) =>
        this.elementToRecord(child)
      ),
      kind
    };
  }

  private getAttribute(attribute: string): string | null {
    if (
      this.currentXmlElement === null ||
      !this.currentXmlElement.hasAttribute(attribute)
    ) {
      return null;
    }
    return this.currentXmlElement.getAttribute(attribute);
  }

  private parseOptionalNumber(attribute: string): number | null {
    const value = this.getAttribute(attribute);
    return value === null ? null : this.parseDoubleAttr(attribute, 0);
  }

  private parseOptionalInteger(attribute: string): number | null {
    const value = this.getAttribute(attribute);
    return value === null ? null : this.parseIntAttr(attribute, 0);
  }
}
