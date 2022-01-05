# Introduction

## Why QueueRun?

Lambda has all the right building blocks — HTTP, WS, SQS, CloudWatch — but you drown in YAML trying to set it up. And the AWS APIs were not designed for JavaScript developers.

Next, Remix, Nuxt, et al are a joy to use — and a source of influence — but they're designed for front-end applications and don't pay enough attention to backend tasks.

QueueRun is for building the back-end of the application, from the HTTP/WS API to the queued and scheduled jobs that run in the background.

QueueRun is designed for building APIs or backends, and deploying to serverless environments. AWS Lambda by default, but GPC, CloudFlare Workers, Fly.io are all options.

Your code is the configuration. You don't need to write boilerplate YAML, we can figure out the URL path for the file `api/todo/[id].ts`, and the queue name from `queues/update.fifo.ts`. Forget about CloudFormation, ot don't learn it to begin with.

Stuff you need in every single project — logging, authentication, form handling, etc — included by default. Use what you like, or replace with your own implementation. No dependency injection either, just export from the module.

## See An Example

Let's install queue-run. We need the command line tool, and types library, so we'll install as dev dependency:

```bash
npm install -D queue-run
# or
yarn add --dev queue-run
```

Next we'll write a simple backend. Start with a resource for listing all bookmarks (GET) and creating a new bookmark (POST):

```ts title="api/bookmarks.ts"
import { inputs } from "./_middleware";
import { queue as screenshots } from "~/queues/screenshots";
import { urlForBookmark } from "./[id]";
import * as db from "~/lib/db";
import { Response } from "queue-run";

// HTTP GET /bookmarks -> JSON
export async function get({ user }) {
  return await db.findAll({ userID: user.id });
}

// And this is HTTP POST -> 303 See Other
export async function post({ request, user }) {
  const { title, url } = await inputs(request);
  const bookmark = await db.create({ title, url, user });

  await screenshots.push({ id: bookmark.id });

  // This will generate a URL like
  // https://example.com/bookmarks/c675e615%
  const newURL = urlForBookmark(bookmark);
  return new Response(newURL, {
    status: 303,
    headers: { Location: newURL }
  });
}
```

You can also fetch (GET), update (PUT), and delete (DELETE) an individual resource:

```ts title="api/bookmarks/[id].ts"
import { inputs } from "./_middleware";
import { url, Response } from "queue-run";
import * as db from "lib/db";

// In Express this would be get('/bookmarks/:id')
export async function get({ params, user }) {
  const bookmark = await db.findOne({
    id: params.id,
    userID: user.id
  });
  // Throw a response to exit request handling early
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function put({ request, params, user }) {
  const bookmark = await db.findOne({
    id: params.id,
    userID: user.id
  });
  if (!bookmark) throw new Response(null, { status: 404 });

  const { title, url } = await inputs(request);
  return await db.updateOne({ id: params.id, title, url });
}

export async function del({ params, user}) {
  await db.deleteOne({
    id: params.id,
    userID: user.id
  });
  return new Response(null, { status: 204 });
}

// index.ts uses this to create URLs
export const urlForBookmark = url.self<{ id: string }>();
```

We'll need some common middleware to authenticate requests, so we can tie them to a user, and to validate inputs for POST + PUT:

```ts title="api/bookmarks/_middleware.ts"
import { form, Response } from "queue-run";
import ow from "ow";

export async function authenticate(request) {
  ... TBD
}

// This is used by two route files, so put it here
export async function inputs(request) {
  // We accept HTML forms and JSON documents
  const { title, url } = await form(request.clone()).
    catch(() => request.json());

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

Our bookmarks service takes screenshots, and these could take several seconds, and even fail intermittently. We'll use a queue for that:

```ts title="queues/screenshots.ts"
import { queues } from "queue-run";
import * as db from "~/lib/db";
import capture from "~/lib/capture";

export default async function ({ id }, { user }) {
  const bookmark = await db.findOne({ id, userID: user.id });
  if (!bookmark) return;

  // This could easily take several seconds,
  // so we're doing this in a background job
  console.info('Taking screenshot of "%s"', bookmark.url)
  const screenshot = await capture(bookmark.url);
  await db.updateOne({ id, userID: user.id,  screenshot });
}

// api/bookmarks/index.ts doesn't need to guess the queue name
//
// Type information for your IDE
export const queue = queues.self<{ id: string }>();
```

Let's run this backend using the development server:

```bash
npx queue-run dev
👋 Dev server listening on http://localhost:8000
```

In another terminal window we're going to create a new bookmark, retrieve that bookmark, and list all the bookmarks:

```bash
curl http://localhost:8000/bookmarks -X POST \
  -F "title=My bookmark" -F "url=http://example.com"
curl http://localhost:8000/bookmarks/74e83d43
curl http://localhost:8000/bookmarks
```
