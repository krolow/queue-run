import xmlbuilder, { XMLElement, XMLNode } from "xmlbuilder";

/* eslint-disable no-unused-vars */
export declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
/* eslint-enable no-unused-vars */

export function jsxs(
  type: string,
  props: { [key: string]: unknown }
): XMLElement {
  return newElement(xmlbuilder.begin(), type, props);
}

export function render(element: XMLElement, indent = "") {
  const pretty = !!indent;
  const isHTML = /^html$/i.test(element.name);
  const text = isHTML
    ? element.dtd().end({ pretty, indent })
    : element.dec("1.0", "utf-8").end({ pretty, indent });
  const type = isHTML
    ? "text/html; charset=utf-8"
    : "application/xml; charset=utf-8";
  return { text, type };
}

export function isElement(object: unknown): object is XMLElement {
  return (
    !!object &&
    typeof object === "object" &&
    "parent" in object &&
    "children" in object &&
    "type" in object &&
    (object as { type: number }).type === 1 &&
    "isRoot" in object &&
    (object as { isRoot: boolean }).isRoot === true
  );
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
  } else if (children) {
    const { type, props } = children as {
      type: string | 1 | 8 | typeof Comment | typeof CDATA | typeof Fragment;
      props: { children: XMLNode[] };
    };
    if (typeof type === "function") {
      addChildren(element, {
        ...type(),
        props,
      });
      return;
    }
    switch (type) {
      case 1: {
        // XMLElement
        element.children.push(children as XMLElement);
        break;
      }
      case 11: {
        for (const child of props.children) element.children.push(child);
        break;
      }
      case 4: {
        element.cdata(String(props.children));
        break;
      }
      case 8: {
        element.comment(String(props.children));
        break;
      }
      default: {
        newElement(element, type as string, props);
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

/**
 * You can use either `<Fragment>` or `<>` to wrap child elements.:
 *
 * ```
 * return(
 *   <>
 *     <item>1</item>
 *     <item>2</item>
 *   </>
 * );
 * ```
 */
export const Fragment = () => ({ type: 11 });

/**
 * Use this to emit a CDATA section in XML.
 *
 * ```
 * import { CDATA } from "queue-run";
 *
 * return (
 *   <code>
 *     <CDATA>{code}</CDATA>
 *   </code>
 * );
 *
 * => <code><![CDATA[my code here]]></code>
 * ```
 */
export const CDATA = () => ({ type: 4 });

/**
 * Use this to emit a comment.
 *
 * ```
 * import { Comment } from "queue-run";
 *
 * return (
 *   <entry>
 *     <Comment>This is a comment</Comment>
 *   </entry>
 * );
 *
 * => <entry><!-- This is a comment --></entry>
 * ```
 */
export const Comment = () => ({ type: 8 });
