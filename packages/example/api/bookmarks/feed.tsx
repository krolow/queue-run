import { url, xml } from "queue-run";
import * as db from "~/lib/db";
import { urlForBookmark } from "./[id]";

export async function get() {
  const bookmarks = await db.findAll();
  return xml(
    <feed xmlns="http://www.w3.org/2005/Atom">
      <url>{String(url.self())}</url>
      <title>Bookmarks</title>
      <link rel="self" href={url.self()()} />
      {Object.entries(bookmarks).map(([id, bookmark]) => (
        <entry>
          <title>{bookmark.title}</title>
          <link href={urlForBookmark(bookmark)} />
          <id>{id}</id>
          <updated>{bookmark.updated}</updated>
          <summary>{bookmark.title}</summary>
        </entry>
      ))}
    </feed>,
    { pretty: true }
  );
}

export const authenticate = false;
