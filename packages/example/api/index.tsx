import { url, xml } from "queue-run";

export async function get() {
  const token = "secret";
  const bookmarksURL = url("/bookmarks");

  return xml(
    <html>
      <head>
        <title>QueueRun by Example</title>
      </head>
      <body>
        <p>Try this out:</p>
        <ol>
          <li>
            <p>Create a bookmark:</p>
            <pre>
              {`
curl ${bookmarksURL} -X POST \\
   -F "title=My bookmark" -F "url=http://example.com" \\
   -H "Authorization: Bearer ${token}"
              `}
            </pre>
          </li>
          <li>
            <p>List all bookmarks:</p>
            <pre>
              {`
curl ${bookmarksURL} -H "Authorization: Bearer ${token}"
curl ${url("/bookmarks/feed")}`}
            </pre>
          </li>
          <li>
            <p>Create and delete bookmark:</p>
            <pre>
              {`
export new_url=$(\\
  curl ${bookmarksURL} -X POST \\
    -F "title=Going to delete this" -F "url=http://example.com" \\
    -H "Authorization: Bearer ${token}" \\
  )
curl $new_url -X DELETE -H "Authorization: Bearer ${token}"`}
            </pre>
          </li>
        </ol>
      </body>
    </html>,
    { pretty: true, mimeType: "text/html" }
  );
}
