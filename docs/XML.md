# Generating XML

Yes, we support XML because XML will outlive us all. There are some use cases: feed readers (Atom and RSS), Sitemap for search engines, etc.  You can use JSX to generate XML documents.

```tsx title=api/items/feed.tsx
import { url } from "queue-run";
import { urlForItem } from "./[id]";

export async function get() {
  const items = await items.find();
  const feedURL = String(url.self());
  return (
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>My Feed</title>
      <link rel="self" href={feedURL} />
      <>
        {items.map(item => (
          <entry>
            <title>{item.title}</title>
            <link href={urlForItem(item))} />
            <id>{item.id}</id>
            <summary>{item.summary}</summary>
          </entry>
        ))}
      </>
    </feed>);
}
```

:::info .jsx/.tsx
Don't forget file extension should be "jsx" or "tsx".
:::

This being JSX, you can use any lower-case element names with careless disregard.

But if you need to use CamelCase, or namespace prefixes, then you have to
declare these elements as constant first.

```tsx
import { Comment } from "queue-run/jsx-runtime";

// Make Name available as JSX element
const Name = "Name";
// The XML element is "ns:Prefix", the JSX name must be CamelCase
const NSPrefix = "ns:Prefix";

return xml(
  <Record {{ 'ns:type': 'record' }}>
    <Comment>This is a comment</Comment>
    <Name>{item.name}</Name>
    <NSPrefix>name:</NSPrefix>
  </Record>
);
```

```xml
<?xml version="1.0" encoding="utf-8"?>
<Record ns:type="record">
  <!-- This is a comment -->
  <Name>itemName</Name>
  <ns:Prefix>name:</ns:Prefix>
</Record>
```

Not a replacement for a proper front-end framework, but in a pinch you can also generate (X)HTML:

```tsx
return (
  <html>
    <head>
      <title>Hello world!</title>
    <head>
    <body>
      👋 I may look like React, but I'm static HTML.
    </body>
  </html>
);
```