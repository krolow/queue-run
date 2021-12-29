
[Working with URLs](urls.md)

[Working with Queues](queues.md)

[Generating XML](xml.md)

### api/bookmarks/index.js
```js
import { Request } from "queue-run";
import * as db from "lib/db";
import { urlForBookmark } from "./[id]";
import { input } from "./_middleware";

export async function get() {
  return await db.findAll();
}

export async function post(request: Request) {
  const bookmark = await db.create(await input(request));
  const url = urlForBookmark(bookmark);
  return new Response(url, { status: 303, headers: { Location: url } });
}
```

### api/bookmarks/[id].js
```js
import { Request, url } from "queue-run";
import * as db from "lib/db";
import { input } from "./_middleware";

export async function get(_, { params }) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function put(request: Request, { params }) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });

  const { title, url } = await input(request);
  return await db.updateOne({ id: params.id, title, url });
}

export async function del(_, { params }) {
  await db.deleteOne(params.id);
  return new Response(null, { status: 204 });
}

export const urlForBookmark = url.self();
```
