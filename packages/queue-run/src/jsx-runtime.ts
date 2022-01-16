import xmlbuilder, { XMLElement, XMLNode } from "xmlbuilder";

/* eslint-disable no-unused-vars */
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
/* eslint-enable no-unused-vars */

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
      type: string | typeof CDATA | typeof Fragment | typeof Comment;
      props: { children: XMLNode[] };
    };
    switch (type) {
      case Fragment: {
        for (const child of props.children)
          element.children.push(child instanceof XML ? child.element : child);
        break;
      }
      case CDATA: {
        element.cdata(String(props.children));
        break;
      }
      case Comment: {
        element.comment(String(props.children));
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
export const Fragment = Symbol("Fragment");

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
export const CDATA = Symbol("CDATA");

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
export const Comment = Symbol("Comment");
