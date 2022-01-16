import * as bookmarks from "#lib/bookmarks.js";
import { Comment, url } from "queue-run";
import { urlForBookmark } from "./[id].js";

export async function get() {
  const all = await bookmarks.findAll();
  return (
    <feed xmlns="http://www.w3.org/2005/Atom">
      <Comment>Atom feed</Comment>
      <url>{String(url.self())}</url>
      <title>Bookmarks</title>
      <link rel="self" href={url.self()()} />
      <>
        {Object.entries(all).map(([id, bookmark]) => (
          <entry>
            <title>{bookmark.title}</title>
            <link href={urlForBookmark(bookmark)} />
            <id>{id}</id>
            <updated>{bookmark.updated}</updated>
            <summary>{bookmark.title}</summary>
          </entry>
        ))}
      </>
    </feed>
  );
}

// Disable the authentication middleware (`false` also works)
export const authenticate = null;
