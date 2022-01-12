import xmlbuilder, { XMLDocument, XMLElement, XMLNode } from "xmlbuilder";

export function jsxs(
  type: string,
  props: { [key: string]: unknown }
): XMLDocument {
  return newElement(xmlbuilder.begin(), type, props);
}

function newElement(
  parent: XMLNode,
  type: string,
  props: { [key: string]: unknown }
): XMLElement {
  const element = parent.ele(type);
  const { children, ...rest } = props;
  for (const [name, value] of Object.entries(rest)) element.att(name, value);
  addChildren(element, children);
  return element;
}

function addChildren(element: XMLElement, children: unknown) {
  if (!children) return;
  if (typeof children === "string" || typeof children === "number") {
    element.txt(String(children));
  } else if (Array.isArray(children)) {
    for (const child of children) addChildren(element, child);
  } else if (typeof children === "object") {
    const { type, props } = children as {
      type: string | 1 | typeof CDATA | typeof Fragment;
      props: {
        children: XMLNode[];
        [key: string]: unknown;
      };
    };
    switch (type) {
      case 1: {
        // XMLElement
        element.children.push(children as XMLNode);
        break;
      }
      case Fragment: {
        for (const child of props.children) element.children.push(child);
        break;
      }
      case CDATA: {
        element.cdata(String(props.children));
        break;
      }
      default: {
        newElement(element, type, props);
        break;
      }
    }
  }
}

export function jsx(
  type: string | Function,
  props: { [key: string]: unknown }
) {
  return { type, props };
}

export const Fragment = Symbol("Fragment");

/**
 * Use this to emit a CDATA section in XML.
 *
 * ```
 * import { CDATA } from "queue-run";
 *
 * return (
 *   <Code>
 *    <CDATA>{code}</CDATA>
 *  </Code>
 * );
 *
 * => <Code><![CDATA[my code here]]></Code>
 * ```
 */
export const CDATA = Symbol("CDATA");
