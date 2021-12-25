import xmlbuilder, { CreateOptions, XMLToStringOptions } from "xmlbuilder";

// Use this with JSX to respond with an XML document:
//
//  export default async function() {
//    return xml(
//      <record>
//        {items.map(item => (
//          <item>{item}</item>}
//        ))}
//      </record>
//    );
//  }
//
// For JSX support, the filename must end with ".jsx" or ".tsx".
//
// The second argument allows you to change the content type (default
// "application/xml"), encoding (default: "utf-8"), whether to include the XML
// declaration (default: true), pretty print (default: false), and other
// options.
//
// This being JSX, if you need to use an Uppercase tag name, you need to declare
// a constant:
//
//   const MyElement = "MyElement";
export function xml(
  xml: string | { [key: string]: any },
  options: CreateOptions & XMLToStringOptions & { contentType: string } = {
    contentType: "application/xml",
    encoding: "utf-8",
    headless: false,
    pretty: false,
    version: "1.0",
  }
) {
  const body = xmlbuilder
    .create(xml, { ...options, separateArrayItems: true })
    .end(options);
  const contentType = `${options.contentType ?? "application/xml"}; charset=${
    options.encoding ?? "utf-8"
  }`;
  return new Response(body, {
    headers: { "Content-Type": contentType },
    status: 200,
  });
}
