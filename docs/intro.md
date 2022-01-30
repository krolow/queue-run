---
slug: /
---

# Introduction

Web 2.0 framework to make building back-ends and APIs easy and fun:

* HTTP APIs, WebSocket, FIFO queues, and (coming) scheduled jobs
* Focus on developer experience and simplicity
* Serverless: deploy and let it worry about scaling up/down 
* Made for the web: REST resources, Fetch API, HTML forms, console.log
* Batteries included: logging, authentication, custom domains, URL constructors
* No need to mess CloudFormation or edit YAML files
* TypeScript and ESM (JavaScript and CommonJS also supported)


## Why QueueRun?

AWS Lambda has all the right building blocks — HTTPS, WebSocket, SQS queues, CloudWatch logs — but the developer experience is not there. I wanted a framework that can go from idea to deploy in minutes not weeks.

Next, Remix, Nuxt, et al solves that for developing front-end applications. I wanted something as easy and fun for building the back-end: the APIs, presence and real-time updates (WebSocket), queued and scheduled jobs, etc. 

Every back-end needs authentication, logging, environment variables, URL construction, etc. The framework should take care of that.

Deployment should take one minute or less. Setting up a new project in under five minutes. Don't want to worry about provisioning servers, scaling up/down, CloudFormation, or that thing they call YAML.

Above all, the developer experience! Common tasks should be as easy as writing a few lines of code. Whether you're building a REST API, real time collaboration (WebSocket), responsive UIs (queues), running background tasks on a schedule.


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

:::info ESM, JavaScript, and TypeScript

All the examples are in TypeScript. Regardless, when using ESM imports, file imports must include the proper extension (`.js`, `.cjs`, or `.mjs`).

If your project is ESM (`package.json` contains `type: "module"`), then imports would use the filename extension `.js`.

If your project is CommonJS, then imports would use the filename extension `.mjs`, as your project is compiled to support ESM.
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

Learn more about [standard and FIFO queues](Queues) and [how to use WebSocket](WebSocket).

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
