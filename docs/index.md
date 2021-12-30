
## Documentation TOC

- [Working with URLs](urls.md) 
- [Working with Queues](queues.md)
- [Generating XML](xml.md)


## Why QueueRun?

* Unapologitecally Web 2.0 framework for buildng services and APIs
* Designed for serverless deployments (you can, but you don't have to manage Node servers)
* Convention over configuration, life's too short to deal with CloudFormation
* Of the web: HTTP and WebSockets, REST resources, Fetch API, console.log, HTML forms
* For the backend: routing, standard and FIFO job queues, scheduled jobs
* Batteries included, with middleware for logging, authentication, multipart/form-data, etc
* TypeScript and JSX if you feel like it

Lambda has all the right building blocks — HTTP, WS, SQS, CloudWatch — but you drown in YAML trying to set it up. And the AWS APIs were not designed for JavaScript developers.

Next, Remix, Nuxt, et al are a joy to use — and a source of influence — but they're designed for front-end applications and don't pay enough attention to backend tasks.

QueueRun is for building the back-end of the application, from the HTTP/WS API to the queued and scheduled jobs that run in the background.

QueueRun is designed for building APIs or backends, and deploying to serverless environments. AWS Lambda by default, but GPC, CloudFlare Workers, Fly.io are all options.

Your code is the configuration. You don't need to write boilerplate YAML, we can figure out the URL path for the file `api/todo/[id].ts`, and the queue name from `queues/update.fifo.ts`. Forget about CloudFormation, ot don't learn it to begin with.

Stuff you need in every single project — logging, authentication, form handling, etc — included by default. Use what you like, or replace with your own implementation. No dependency injection either, just export from the module.


## See An Example

### api/bookmarks/index.ts
```js
import { input } from "./_middleware";
import { queue as screenshots } from "../../queues/screenshots";
import { urlForBookmark } from "./[id]";
import * as db from "lib/db";

// HTTP GET /bookmarks
export async function get() {
  // object -> JSON
  return await db.findAll();
}

// And this is an HTTP post
export async function post({ request }: { request: Request }) {
  const bookmark = await db.create(await input(request));
  await screenshots.push({ id: bookmark.id });

  // This will generate a URL like
  // https://example.com/bookmarks/c675e615%
  const url = urlForBookmark(bookmark);
  return new Response(url, { status: 303, headers: { Location: url } });
}
```

### api/bookmarks/[id].js
```js
import { input } from "./_middleware";
import { url } from "queue-run";
import * as db from "lib/db";

type Resource = { request: Request, params: { id: string } };

// In Express this would be get('/bookmarks/:id')
export async function get({ params }: Resource) {
  const bookmark = await db.findOne(params.id);
  // Throw a response to exit request handling early
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function put({ request, params }: Resource) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });

  const { title, url } = await input(request);
  return await db.updateOne({ id: params.id, title, url });
}

export async function del({ params }: Resource) {
  await db.deleteOne(params.id);
  return new Response(null, { status: 204 });
}

// So this is how api/bookmarks/index.ts creates URLs
export const urlForBookmark = url.self<Resource['params']>();
```

### api/bookmarks/_middleware.ts
```js
import { form } from "queue-run";
import ow from "ow";

// This is used by two route files, so put it here
export async function input(request: Request) {
  // If not a JSON document than maybe an HTML form?
  // If neither, this throws 415 Unsupported Media Type
  const { title, url } = await request
    .clone()
    .json()
    .catch(() => form(request));
  // Validate inputs early and validate inputs often
  try {
    ow(url, ow.string.url.matches(/^https?:/));
    ow(title, ow.string.nonEmpty.message("Title is required"));
    return { title, url };
  } catch (error) {
    throw new Response(String(error), { status: 422 });
  }
}
```

### queues/screenshots.ts
```js
import { queues } from "queue-run";
import * as db from "../lib/db";
import capture from "../lib/screenshot";

type Payload = { id: string };

export default async function ({ id }: Payload) {
  const bookmark = await db.findOne(id);
  if (!bookmark) return;

  // This could easily take several seconds,
  // so we're doing this in a background job
  const screenshot = await capture(bookmark.url);
  await db.updateOne({ id, screenshot });
}

// api/bookmarks/index.ts doesn't need to guess the queue name
// IDE can show you type information for push(payload)
export const queue = queues.self<Payload>();
```
