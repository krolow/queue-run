---
slug: /
---

# Introduction

Web 2.0 framework to make building backends and APIs easy and fun:

* HTTP APIs, WebSocket, Web Push (coming), FIFO queues, and scheduled jobs
* Focus on developer experience and simplicity
* Serverless: deploy and let it worry about scaling up/down 
* Made for the web: REST resources, Fetch API, HTML forms, console.log
* Batteries included: logging, authentication, custom domains, URL constructors
* No need to mess CloudFormation or edit YAML files
* TypeScript and ESM (JavaScript and CommonJS also supported)


## Why QueueRun?

AWS Lambda has all the right building blocks — HTTPS, WebSocket, SQS queues, CloudWatch logs — but the developer experience is not there. I wanted a framework that can go from idea to deploy in minutes not weeks.

Next, Remix, Nuxt, et al solves that for developing front-end applications. I wanted something as easy and fun for building the backend: the APIs, presence and real-time updates (WebSocket), queued and scheduled jobs, etc. 

Every backend needs authentication, logging, environment variables, URL construction, etc. The framework should take care of that.

Deployment should take less than 2 minutes. Setting up a new project in under 5 minutes. Don't want to worry about provisioning servers, scaling up/down, CloudFormation, or that thing they call YAML.

Above all, the developer experience! Common tasks should be as easy as writing a few lines of code. Whether you're building a REST API, real time collaboration (WebSocket), responsive UIs (queues), running background tasks on a schedule.


## See An Example

Let's install queue-run. We need the command line tool, and types library, so we'll install as dev dependency:

```bash title=npm
npm install -D queue-run
```

```bash title=yarn
yarn add --dev queue-run
```

### HTTP Requests

Next we'll write a simple backend. Start with a resource for listing all bookmarks (GET) and creating a new bookmark (POST):

:::tip Clone Our Example
You can also [clone the repo](https://github.com/assaf/queue-run) and look at the [packages/example](https://github.com/assaf/queue-run/tree/main/packages/example) directory.
:::

```ts title=api/bookmarks.ts
import { queue as screenshots } from "#queues/screenshots.js";
import { urlForBookmark } from "./[id].js";
import db from "#lib/db.js";

// HTTP GET /bookmarks -> JSON
export async function get({ user }) {
  return await db.bookmarks.findAll({ userId: user.id });
}

// And this is HTTP POST -> 303 See Other
export async function post({ body, user }) {
  const { title, url } = body;
  const bookmark = await db.bookmarks.create({ title, url, user });

  await screenshots.push({ id: bookmark.id });

  // This will generate a URL like
  // https://example.com/bookmarks/c675e615%
  const newURL = urlForBookmark(bookmark);
  return Response.redirect(newURL, 303);
}
```

:::info JavaScript, TypeScript, and ESM

You can write your backend in JavaScript, TypeScript, or combination of both.

All the examples are in TypeScript, to illustrate how you can use type checks.

ESM imports must end with the filename extension `.js` (or `.jsm`).

Learn more about [using TypeScript and ESM](language).
:::

You can also fetch (GET), update (PUT), and delete (DELETE) an individual resource:

```ts title=api/bookmarks/[id].ts
import { url } from "queue-run";
import db from "#lib/db.js";

// In Express this would be get('/bookmarks/:id')
export async function get({ params, user }) {
  const bookmark = await db.bookmarks.findOne({
    id: params.id,
    userId: user.id
  });
  // Throw a response to exit request handling early
  if (!bookmark) throw new Response(null, { status: 404 });
  return bookmark;
}

export async function put({ body, params, user }) {
  const bookmark = await db.bookmarks.findOne({
    id: params.id,
    userId: user.id
  });
  if (!bookmark) throw new Response(null, { status: 404 });

  const { title } = body;
  return await db.bookmarks.updateOne({ id: params.id, title });
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

Learn more about [handling HTTP requests and routing](HTTP).

### Authentication

We'll need some common middleware to authenticate requests, so we can tie them to a user:

```ts title=api/_middleware.ts
import { form } from "queue-run";

export async function authenticate({ bearerToken }) {
  const profile = await jwt.verify({
    token: bearerToken,
    secret: process.env.JWT_SECRET
  });
  const user = await users.findOne(profile.sub);
  if (!user) throw new Response("No such user", { status: 403 });
  return user;
}
```

Learn more [about authentication](authenticate.md).

### Queues

Our bookmarks service takes screenshots, and these could take several seconds, and even fail intermittently. We'll use a queue for that:

```ts title=queues/screenshots.ts
import { queues, socket } from "queue-run";
import db from "#lib/db.js";
import capture from "#lib/capture.js";

export default async function ({ id }, { user }) {
  const bookmark = await db.bookmarks.findOne({ id, userId: user.id });
  if (!bookmark) return;

  // This could easily take several seconds,
  // so we're doing this in a background job
  console.info("Taking screenshot of %s", bookmark.url)
  const screenshot = await capture(bookmark.url);
  await db.bookmarks.updateOne({ id, userId: user.id,  screenshot });

  // If the client uses WebSocket, let them know we updated the bookmark
  await socket.push({ update: 'bookmark', id });
}

// api/bookmarks/index.ts doesn't need to guess the queue name
//
// Type information for your IDE
export const queue = queues.self<{ id: string }>();
```

Learn more about [standard and FIFO queues](queues.md).

### WebSocket

In this example we're using WebSocket to notify the browser when we're done capturing the screenshot.

So we only need two pieces of code. From the browser, open a WebSocket connection and authenticate it:

```ts title=web/client.ts
const ws = new WebSocket("wss://ws.grumpy-sunshine.queue.run");

// Connection opens, we immediately attempt to authenticate
ws.onopen = () => ws.send({ jwtToken });

// Wait for the server to either accept (message) or deny (close socket)
await new Promise((resolve, reject) => {
  ws.onmessage = resolve;
  ws.onclose = reject;
});
```

From the server, handle the authentication request and acknowledge it:

```ts title=socket/_middleware.ts
export async function authenticate({ data }) {
  try {
    const profile = await jwt.verify({
      token: data.token,
      secret: process.env.JWT_SECRET
    });
    return await users.findOne(profile.sub);
    return { id: sub, email };
  } catch {
    // Reject by closing the WebSocket
    await socket.close();
  }
}
```

Learn [more about WebSocket](websocket.md).


## Use Locally

Let's run this backend using the development server:

```bash
npx queue-run dev
```

```
👋 Dev server listening on:
   http://localhost:8000
   ws://localhost:8000
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

:::tip Install Dependencies

To speed up `npx queue-run` you can install these two development dependencies:

```bash title=npm
npm install -D queue-run queue-run-cli
```

```bash title=yarn
yarn add -D queue-run queue-run-cli
```
:::


## Deploy To Production

We'll start by initializing the project. You only need to do this once, when you start working on a new project (recommended) or before the first deploy.

It will ask you a few question: project name, JavaScript or TypeScript, runtime. Then fill in any missing files.

And then we deploy!

```bash
npx queue-run deploy
```

You'll see the URL for your new backend. You can try and make HTTP requests against it, open WebSocket connection, etc.

Learn more about commands to [deploy your code, setup custom domains, watch logs, rollback, and more](deploying.md).

:::tip
If you used [our example](https://github.com/assaf/queue-run/tree/main/packages/example), then you can open the URL in your browser, and it will show you `curl` commands for testing your the backend.
:::
