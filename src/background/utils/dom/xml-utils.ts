// src/background/utils/dom/xml-utils.ts

/**
 * XML Utilities - Helper functions cho XML manipulation
 */
export class XmlUtils {
  /**
   * Parse XML string thành Document
   */
  static parseXML(xmlString: string): Document | null {
    if (!xmlString) return null;

    try {
      const parser = new DOMParser();
      return parser.parseFromString(xmlString, "text/xml");
    } catch (error) {
      console.error("[XmlUtils] Lỗi parse XML:", error);
      return null;
    }
  }

  /**
   * Serialize Document thành XML string
   */
  static serializeXML(doc: Document): string {
    if (!doc) return "";

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  }

  /**
   * Lấy text content của element
   */
  static getTextContent(element: Element | null, selector?: string): string {
    if (!element) return "";

    let targetElement = element;
    if (selector) {
      targetElement = element.querySelector(selector) || element;
    }

    return targetElement.textContent?.trim() || "";
  }

  /**
   * Lấy attribute value
   */
  static getAttribute(
    element: Element | null,
    attributeName: string
  ): string | null {
    if (!element) return null;

    return element.getAttribute(attributeName);
  }

  /**
   * Tìm tất cả elements với selector
   */
  static queryAll(xmlDoc: Document | Element, selector: string): Element[] {
    if (!xmlDoc) return [];

    const elements = xmlDoc.querySelectorAll(selector);
    return Array.from(elements);
  }

  /**
   * Tạo XML element
   */
  static createElement(
    doc: Document,
    tagName: string,
    attributes?: Record<string, string>,
    textContent?: string
  ): Element {
    const element = doc.createElement(tagName);

    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    if (textContent) {
      element.textContent = textContent;
    }

    return element;
  }

  /**
   * Validate XML structure
   */
  static validateXML(xmlString: string): { valid: boolean; error?: string } {
    if (!xmlString) {
      return { valid: false, error: "XML string is empty" };
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, "text/xml");

      // Check for parsing errors
      const parserError = doc.querySelector("parsererror");
      if (parserError) {
        const errorText = parserError.textContent || "Unknown parsing error";
        return { valid: false, error: errorText };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: (error as Error).message };
    }
  }

  /**
   * Extract data từ XML theo mapping
   */
  static extractData(
    xmlDoc: Document,
    mapping: Record<string, string>
  ): Record<string, any> {
    const result: Record<string, any> = {};

    Object.entries(mapping).forEach(([key, selector]) => {
      const element = xmlDoc.querySelector(selector);
      if (element) {
        result[key] = element.textContent?.trim() || "";
      }
    });

    return result;
  }

  /**
   * Transform XML với XSLT
   */
  static transformXML(xmlString: string, xsltString: string): string | null {
    if (!xmlString || !xsltString) return null;

    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, "text/xml");
      const xsltDoc = parser.parseFromString(xsltString, "text/xml");

      const processor = new XSLTProcessor();
      processor.importStylesheet(xsltDoc);

      const resultDoc = processor.transformToDocument(xmlDoc);
      const serializer = new XMLSerializer();
      return serializer.serializeToString(resultDoc);
    } catch (error) {
      console.error("[XmlUtils] Lỗi transform XML:", error);
      return null;
    }
  }

  /**
   * Pretty print XML
   */
  static prettyPrint(xmlString: string, indentSize: number = 2): string {
    if (!xmlString) return "";

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlString, "text/xml");

      const serializer = new XMLSerializer();
      let formatted = "";

      const formatNode = (node: Node, depth: number) => {
        const indent = " ".repeat(depth * indentSize);

        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          formatted += `${indent}<${element.tagName}`;

          // Add attributes
          const attributes = Array.from(element.attributes);
          attributes.forEach((attr) => {
            formatted += ` ${attr.name}="${attr.value}"`;
          });

          const childNodes = Array.from(element.childNodes);
          const hasElementChildren = childNodes.some(
            (child) => child.nodeType === Node.ELEMENT_NODE
          );

          if (hasElementChildren) {
            formatted += ">\n";

            childNodes.forEach((child) => {
              formatNode(child, depth + 1);
            });

            formatted += `${indent}</${element.tagName}>\n`;
          } else {
            const textContent = element.textContent?.trim();
            if (textContent) {
              formatted += `>${textContent}</${element.tagName}>\n`;
            } else {
              formatted += "/>\n";
            }
          }
        } else if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent?.trim();
          if (text) {
            formatted += `${indent}${text}\n`;
          }
        }
      };

      formatNode(doc.documentElement, 0);
      return formatted;
    } catch (error) {
      console.error("[XmlUtils] Lỗi pretty print:", error);
      return xmlString;
    }
  }

  /**
   * Merge multiple XML documents
   */
  static mergeXML(
    documents: Document[],
    rootTag: string = "root"
  ): Document | null {
    if (!documents.length) return null;

    try {
      const parser = new DOMParser();
      const mergedDoc = parser.parseFromString(
        `<${rootTag}></${rootTag}>`,
        "text/xml"
      );
      const rootElement = mergedDoc.documentElement;

      documents.forEach((doc) => {
        const importedNode = mergedDoc.importNode(doc.documentElement, true);
        rootElement.appendChild(importedNode);
      });

      return mergedDoc;
    } catch (error) {
      console.error("[XmlUtils] Lỗi merge XML:", error);
      return null;
    }
  }

  /**
   * Filter XML elements bằng XPath
   */
  static filterByXPath(xmlDoc: Document, xpath: string): Element[] {
    if (!xmlDoc) return [];

    try {
      const evaluator = new XPathEvaluator();
      const result = evaluator.evaluate(
        xpath,
        xmlDoc,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );

      const elements: Element[] = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i);
        if (node && node.nodeType === Node.ELEMENT_NODE) {
          elements.push(node as Element);
        }
      }

      return elements;
    } catch (error) {
      console.error("[XmlUtils] Lỗi XPath:", error);
      return [];
    }
  }
}
