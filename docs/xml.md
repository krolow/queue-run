# Generating XML

Yes, we support XML because XML will outlive us all. There are some use cases: feed readers (Atom and RSS), Sitemap for search engines, etc.

You can use JSX to generate XML documents:

```jsx
import { url, xml } from "queue-run";
import { urlForItem } from "./[id]";

export async function get() {
  const items = await db.find();
  const feedURL = String(url.self());
  return xml(
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>My Feed</title>
      <link rel="self" href={feedURL} />
      {items.map(item => (
        <entry>
          <title>{item.title}</title>
          <link href={urlForItem(item))} />
          <id>{item.id}</id>
          <summary>{item.summary}</summary>
        </entry>
      ))}
    </feed>, { 
      contentType: "application/atom+xml",
    }
  );
}
```

The `xml()` function takes two arguments. The first argument is the XML
document.

The second argument supports various rendering options:

- `encoding` - The document encoding (default is: `utf-8`)
- `headless` - True to drop the XML header (default: false)
- `mimeType` - The document body MIME type (default is: `application/xml`)
- `pretty` - Pretty pring the result (default: false)

This being JSX, you can use any lower-case element names with careless disregard.

But if you need to use CamelCase, or namespace prefixes, then you have to
declare these elements as constant first.

```js
// Make Name available as JSX element
const Name = "Name";
// The XML element is "ns:prefix", the JSX name must be CamelCase
const NSPrefix = "ns:prefix";

return xml(
  <Record {{ 'ns:type': 'record' }}>
    <Name>{item.name}</Name>
    <NSPrefix>name:</NSPrefix>
  </Record>
);
```

You can also generate HTML:

```js
return xml(
  <html>
    <head>
      <title>Hello world!</title>
    <head>
    <body>
      👋 I may look like React, but I'm static HTML.
    </body>
  </html>,
  { mimeType: "text/html" }}
);
```