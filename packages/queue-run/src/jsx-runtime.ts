import xmlbuilder, { XMLElement, XMLNode } from "xmlbuilder";
import { Fragment } from "./jsx-runtime";

export class XML {
  readonly element: XMLElement;

  constructor(element: XMLElement) {
    this.element = element;
  }

  serialize(indent = "") {
    const pretty = !!indent;
    return this.isHTML
      ? this.element.dtd().end({ pretty, indent })
      : this.element.dec("1.0", "utf-8").end({ pretty, indent });
  }

  get isHTML(): boolean {
    return /^html$/i.test(this.element.name);
  }
}

export function jsxs(type: string, props: { [key: string]: unknown }): XML {
  const element = newElement(xmlbuilder.begin(), type, props);
  return new XML(element);
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

// eslint-disable-next-line sonarjs/cognitive-complexity
function addChildren(element: XMLElement, children: unknown) {
  if (typeof children === "string" || typeof children === "number") {
    element.txt(String(children));
  } else if (Array.isArray(children)) {
    for (const child of children) addChildren(element, child);
  } else if (children instanceof XML) {
    element.children.push(children.element);
  } else if (children) {
    const { type, props } = children as {
      type: string | typeof CDATA | typeof Fragment;
      props: { children: XMLNode[] };
    };
    if (type === Fragment) {
      for (const child of props.children)
        element.children.push(child instanceof XML ? child.element : child);
    } else if (type === CDATA) {
      element.cdata(String(props.children));
    } else {
      newElement(element, type, props);
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
