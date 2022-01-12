---
slug: /
---

# Introduction

* Unapologitecally Web 2.0 framework for buildng back-ends and APIs
* Designed for serverless deployments
* You don't have to know any CloudFormation
* Of the web: HTTP and WebSocket, REST resources, Fetch API, console.log, HTML forms, Blob
* For the backend: routing, standard and FIFO job queues, scheduled jobs
* Batteries included: logging, authentication, multipart/form-data, etc
* TypeScript and JSX if you're so inclined

## Why QueueRun?

Lambda has all the right building blocks — HTTP, WS, SQS, CloudWatch — but you drown in YAML trying to set it up. And the AWS APIs were not designed for JavaScript developers.

Next, Remix, Nuxt, et al are a joy to use — and a source of influence — but they're designed for front-end applications and don't pay enough attention to backend tasks.

QueueRun is for building the back-end of the application, from the HTTP/WS API to the queued and scheduled jobs that run in the background.

QueueRun is designed for building APIs or backends, and deploying to serverless environments. AWS Lambda by default, but GPC, CloudFlare Workers, Fly.io are all options.

Your code is the configuration. You don't need to write boilerplate YAML, we can figure out the URL path for the file `api/todo/[id].ts`, and the queue name from `queues/update.fifo.ts`. Forget about CloudFormation, ot don't learn it to begin with.

Stuff you need in every single project — logging, authentication, form handling, etc — included by default. Use what you like, or replace with your own implementation. No dependency injection either, just export from the module.

## See An Example

Let's install queue-run. We need the command line tool, and types library, so we'll install as dev dependency:

```bash title=npm
npm install -D queue-run
```

```bash title=yarn
yarn add --dev queue-run
```

Next we'll write a simple backend. Start with a resource for listing all bookmarks (GET) and creating a new bookmark (POST):

:::tip Clone Our Example
You can also [clone the repo](https://github.com/assaf/queue-run) and look at the [packages/example](https://github.com/assaf/queue-run/tree/main/packages/example) directory.
:::

```ts title=api/bookmarks.ts
import { queue as screenshots } from "~queues/screenshots.js";
import { urlForBookmark } from "./[id].js";
import * as db from "~lib/db.js";
import { Response } from "queue-run";

// HTTP GET /bookmarks -> JSON
export async function get({ user }) {
  return await db.findAll({ userId: user.id });
}

// And this is HTTP POST -> 303 See Other
export async function post({ body, user }) {
  const { title, url } = body;
  const bookmark = await db.create({ title, url, user });

  await screenshots.push({ id: bookmark.id });

  // This will generate a URL like
  // https://example.com/bookmarks/c675e615%
  const newURL = urlForBookmark(bookmark);
  return Response.redirect(newURL, 303);
}
```

You can also fetch (GET), update (PUT), and delete (DELETE) an individual resource:

```ts title=api/bookmarks/[id].ts
import { url, Response } from "queue-run";
import * as db from "~lib/db.js";

// In Express this would be get('/bookmarks/:id')
export async function get({ params, user }) {
  const bookmark = await db.findOne({
    id: params.id,
    userId: user.id
  });
  // Throw a response to exit request handling early
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function put({ body, params, user }) {
  const bookmark = await db.findOne({
    id: params.id,
    userId: user.id
  });
  if (!bookmark) throw new Response(null, { status: 404 });

  const { title } = body;
  return await db.updateOne({ id: params.id, title });
}

export async function del({ params, user}) {
  await db.deleteOne({
    id: params.id,
    userId: user.id
  });
  return new Response(null, { status: 204 });
}

// index.ts uses this to create URLs
export const urlForBookmark = url.self<{ id: string }>();
```

We'll need some common middleware to authenticate requests, so we can tie them to a user:

```ts title=api/_middleware.ts
import { form, Response } from "queue-run";

export async function authenticate(request) {
  ... TBD
}
```

Our bookmarks service takes screenshots, and these could take several seconds, and even fail intermittently. We'll use a queue for that:

```ts title=queues/screenshots.ts
import { queues } from "queue-run";
import * as db from "~lib/db.js";
import capture from "~lib/capture.js";

export default async function ({ id }, { user }) {
  const bookmark = await db.findOne({ id, userId: user.id });
  if (!bookmark) return;

  // This could easily take several seconds,
  // so we're doing this in a background job
  console.info('Taking screenshot of "%s"', bookmark.url)
  const screenshot = await capture(bookmark.url);
  await db.updateOne({ id, userId: user.id,  screenshot });
}

// api/bookmarks/index.ts doesn't need to guess the queue name
//
// Type information for your IDE
export const queue = queues.self<{ id: string }>();
```

Let's run this backend using the development server:

```bash
npx queue-run dev
```

```
👋 Dev server listening on:
   http://localhost:8000
   ws://localhost:8001
```

In another terminal window we're going to create a new bookmark, retrieve that bookmark, and list all the bookmarks:

```bash
curl http://localhost:8000/bookmarks -X POST \
  -F "title=My bookmark" -F "url=http://example.com"
```

```bash
curl http://localhost:8000/bookmarks/74e83d43
```

```bash
curl http://localhost:8000/bookmarks
```

## Deploy To Production

We'll start by initializing the project. You only need to do this once, when you start working on a new project (recommended) or before the first deploy.

It will ask you a few question: project name, JavaScript or TypeScript, runtime. Then fill in any missing files.

And then we deploy!

```bash
npx queue-run init
```

```bash
npx queue-run deploy
```

You'll see the URL for your new backend. You can try and make HTTP requests against it, open WebSocket connection, etc.

:::tip
If you used [our example](https://github.com/assaf/queue-run/tree/main/packages/example), then you can open the URL in your browser, and it will show you `curl` commands for testing your the backend.
:::