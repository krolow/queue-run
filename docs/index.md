
## Why Queue Run?

Lambda has all the right building blocks — HTTP, WS, SQS, CloudWatch — but you drown in YAML trying to set everything up, and the APIs are not for JavaScript developers.

Next, Remix, Nuxt, et al are a joy to use — and source of influence — but they're designed for front-end applications and don't pay enough attention to the back-end.

QueueRun is for building the back-end of the application, from the HTTP/WS API to the queued and scheduled jobs that run in the background.

* Unapologitecally Web 2.0 framework for buildng services and APIs
* Designed for serverless deployments, you can but you don't have to manage Node servers
* Convention over configuration, life's too short to be dealing with CloudFormation
* Of the web: HTTP and WebSockets, REST resources, Fetch API, console.log, HTML forms
* For the backend: routing, standard and FIFO job queues, scheduled jobs
* Batteries included: with common middleware for logging, authentication, multipart/form-data
* TypeScript and JSX if you feel like it

QueueRun is designed for serverless deployment. With the proper runtime, it can run on AWS Lambda, GPC Functions, CloudFlare Workers, Fly.io, etc. It can also run anywhere you run a Node server: Heroku, EC2, K8N.

Your code acts as configuration. If we can figure out that `api/todo/[id].js` is an HTTP endpoint with the path parameter `id`, then we can figure out that `queues/update.fifo.ts` is FIFO queue. Forget about CloudFormation, or don't learn it to begin with.

All the stuff you need in every single project — logging, authentication, form handling, etc — included by default. Use what you like, or replace with your own implementation. As simple as `export function authenticate()`.


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

export async function post({ request }) {
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

export async function get({ params }) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function put({ request, params }) {
  const bookmark = await db.findOne(params.id);
  if (!bookmark) throw new Response(null, { status: 404 });

  const { title, url } = await input(request);
  return await db.updateOne({ id: params.id, title, url });
}

export async function del({ params }) {
  await db.deleteOne(params.id);
  return new Response(null, { status: 204 });
}

export const urlForBookmark = url.self();
```

### api/bookmarks/_middleware.js
```js
import ow from "ow";
import { form, jwt } from "queue-run";

export const authenticate = jwt(process.env.JWT_SECRET);

export async function input(request) {
  // If not a JSON document than maybe HTML form, and if neither,
  // browser receives 415 Unsupported Media Type
  const { title, url } = await request
    .clone()
    .json()
    .catch(() => form(request));
  // Validate inputs often and validate early
  try {
    ow(url, ow.string.url.matches(/^https?:/).message("HTTP/S URL required"));
    ow(title, ow.string.nonEmpty.message("Title is required"));
    return { title, url };
  } catch (error) {
    throw new Response(String(error), { status: 422 });
  }
}
```
