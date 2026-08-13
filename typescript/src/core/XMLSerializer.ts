/** Portable DOM helpers from XMLSerializer.java. */
export class XMLSerializer {
  public static escapeXml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  public static prettyPrint(documentOrElement: Document | Element): string {
    const element =
      documentOrElement instanceof Document
        ? documentOrElement.documentElement
        : documentOrElement;
    return XMLSerializer.prettyPrintNode(element, 0);
  }

  public static checkAttr(element: Element, name: string): void {
    if (element.hasAttribute(name)) {
      throw new Error(`naming conflict: ${name}`);
    }
  }

  public static dumpAttr(
    element: Element,
    name: string,
    value: string | number | boolean
  ): void {
    XMLSerializer.checkAttr(element, name);
    let serialized = String(value);
    if (typeof value === "string") {
      serialized = serialized
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        .replace(/</g, "&lt;");
    }
    element.setAttribute(name, serialized);
  }

  private static prettyPrintNode(node: Element, indent: number): string {
    const indentation = "  ".repeat(indent);
    let result = `${indentation}<${node.nodeName}`;

    for (const attribute of Array.from(node.attributes)) {
      result += ` ${attribute.name}="${XMLSerializer.escapeXml(
        attribute.value
      )}"`;
    }

    if (node.childNodes.length === 0) {
      return `${result}/>\n`;
    }
    result += ">";

    let hasElementChildren = false;
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!hasElementChildren) {
          result += "\n";
        }
        hasElementChildren = true;
        result += XMLSerializer.prettyPrintNode(
          child as Element,
          indent + 1
        );
      } else if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue?.trim() ?? "";
        if (text.length > 0) {
          result += XMLSerializer.escapeXml(text);
        }
      }
    }

    if (hasElementChildren) {
      result += indentation;
    }
    return `${result}</${node.nodeName}>\n`;
  }
}
