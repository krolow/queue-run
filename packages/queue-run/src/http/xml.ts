import xmlbuilder, { XMLDocument, XMLElement, XMLNode } from "xmlbuilder";

export function jsxs(type: string, props: { [key: string]: any }): XMLDocument {
  return newElement(xmlbuilder.begin(), type, props);
}

function newElement(
  parent: XMLNode,
  type: string,
  props: { [key: string]: any }
): XMLElement {
  const element = parent.ele(type);
  const { children, ...rest } = props;
  for (const [name, value] of Object.entries(rest)) element.att(name, value);
  addChildren(element, children);
  return element;
}

function addChildren(element: XMLElement, children: any) {
  if (typeof children === "string" || typeof children === "number") {
    element.txt(String(children));
  } else if (Array.isArray(children)) {
    for (const child of children) addChildren(element, child);
  } else if (typeof children === "object") {
    const { type, props } = children;
    switch (type) {
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

export function jsx(type: string | Function, props: { [key: string]: any }) {
  return { type, props };
}

export const Fragment = Symbol("Fragment");

export const CDATA = Symbol("CDATA");
