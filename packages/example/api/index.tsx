import { xml } from "queue-run";

export async function get() {
  const token = "secret";

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
curl http://localhost:8000/bookmarks -X POST \\
   -F "title=My bookmark" -F "url=http://example.com" \\
   -H "Authorization: Bearer ${token}"
              `}
            </pre>
          </li>
          <li>
            <p>List all bookmarks:</p>
            <pre>
              {`
curl http://localhost:8000/bookmarks -H "Authorization: Bearer ${token}"
curl http://localhost:8000/bookmarks/feed`}
            </pre>
          </li>
          <li>
            <p>Create and delete bookmark:</p>
            <pre>
              {`
export url=$(\\
  curl http://localhost:8000/bookmarks -X POST \\
    -F "title=Going to delete this" -F "url=http://example.com" \\
    -H "Authorization: Bearer ${token}" \\
  )
curl $url -X DELETE -H "Authorization: Bearer ${token}"`}
            </pre>
          </li>
        </ol>
      </body>
    </html>,
    { pretty: true, mimeType: "text/html" }
  );
}
