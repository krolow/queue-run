# HTTP/REST

## Routes and files

You can stuff the entire API into a single POST request. Alternatively you can use multiple resources with structured URLs paths. QueueRun was designed for the later.

For convenience, the URL structure is mirrored in the file system:

- API routes are located in the `api` directory, but `api` is not part of the URL
- The filename extension (`js`, `ts`, `tsx`, etc) is not part of the URL
- Filename maps to a URL path, so `api/posts/latest.ts` maps to `/posts/latest`
- Except that `index` gets dropped, so `api/ports/index.ts` mapts to `/posts`
- Filenames with square brackets denote paramters, etc `api/posts/[id].ts`
- You can have multiple parameters, such as `api/project/[project]/task/[task].ts`
- The last parameter can be catch-all, such as `api/post/[...slug].ts`
- Filenames that start with `_` are not mapped to URLs

Here are some examples:

- `api/index.ts` will respond to `/`
- `api/map.ts' will respond to `/map`
- `api/todo/[id].ts` will respond to `/todo/123` and `/todo/456`
- `api/todo/index.ts` will respond to `/todo`
- `api/post/[...slug].ts` will respond to `/post/damn-interesting` and `/post/2022/01/new-year`
- `api/feed.xml` will response to `/feed.xml`

## Request handlers

Request handlers accept the HTTP request and spit out the response.

They take a single argument with named parameters:

- `request` - The HTTP [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object
- `cookies` - Object with all cookies included in the request (eg `{ session: "1def…" }`)
- `params` - Object with request parameters from the URL (eg `{ id: "123" }`)
- `query` — Object with query string parameters (eg `{ first: "5" }`)
- `signal` — [Signal](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) for aborting long running requests
- `user` — User object returned from [authenticate](Authenticate.md) method

Request handler can return:

- `Object` — (not string or buffer) Respond with a JSON document (`application/json`)
- [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) — The HTTP response
- `String` — Respond with content type `text/plain`, UTF-8 encoded
- `Buffer` — Respond with content type `application/octet-stream`
- `JSX` — Response with content type `text/html` or `application/xml` (see [Generating XML](XML))
- `null` — Respond with 204 No Content

The request handler can also throw a `Response` object. That response is returned to the client.

This is not an error, but a useful mechanism for breaking early from request handling. For example, [authentication](Authenticate) uses this effectively.

If the request handler throws any other error, the server responds with 500. That error is also logged, see [Logging Middleware](#logging-middleware).

## HTTP methods

You can response to HTTP methods in one of two ways. By exporting a function for each method the route supports, or by exporting a default request handler.

For example:

```ts
// HTTP GET responds with JSON document or 404
export async function get({ params }) {
  const item = await db.findOne(params.id);
  if (!item) throw new Response(null, { status: 400 });
  return item;
}

// HTTP PUT accepts JSON document as well
export async function put({ params, request }) {
  const item = await db.findOne(params.id);
  if (!item) throw new Response(null, { status: 400 });

  const fields = await request.json();
  return await db.update({ id: params.id, ...fields });
}

// HTTP DELETE, since "delete" is a keyword in JavaScript,
// we shortern to "del"
export async function del({ params }) {
  await db.remove(params.id);
  return null;
}
```

You should know:

* This route will only accept method explicitly exported, and respond with 405 (Method Not Allowed) to all other requests
* For HEAD requests, since there's no `head` function, it will use the `get` function instead
* For OPTIONS requests, `Access-Control-Allow-Methods` will list allowed methods

:::info delete => del
`delete` is a reserved keyword in JavaScript, so use `del` to export the HTTP DELETE method handler.
:::

You can handle all methods from the default export:

```ts
export default async function({ params, request }) {
  switch (request.method) {
    case 'GET': {
      const item = await db.findOne(params.id);
      if (!item) throw new Response(null, { status: 400 });
      return item;
    }
    case 'PUT': {
      ...
    }
    case 'DELETE': {
      ...
    }
    default:
      throw new Response(null, { status: 405 });
  }
}
```

You can also limit which methods are accepted:

```ts
export const config = {
  methods: ['GET', 'PUT', 'DELETE']
};
```

:::info OPTIONS
If you want to handle the OPTIONS request yourself, you need to turn off CORS:

```ts
export const config = { cors: false };
```
:::


## Content types

A typical API would be JSON all the way and not care much about checking and negotiating content types.

The [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) makes it really easy to parse JSON requests.

For responses, any object you return, will be turned into a JSON document.

So the common use case is as simple as:

```ts
export async function post({ request }) {
  const { message } = await request.json();
  return { message };
}

curl http://localhost:8000/ -d '{ "message": "Hi" }'
=> {"messge":"Hi"}
```

To handle other media types, you can get the raw buffer (`response.arrayBuffer()`) or text (`response.text()`).


## The form() function

If you want to support HTML forms, there's a convenience method that will handle that for you.

It understands `application/x-www-form-urlencoded` and `multipart/form-data`.

Form fields are converted to name/value pairs. For encoded forms (defaults), the values are strings. For multipart forms, field value can also be [File](https://developer.mozilla.org/en-US/docs/Web/API/File).

If the field appears multiple times in the form, the value will be an array.

### x-www-form-urlencoded

```html title=encoded.html
<form method="post">
  <input name="name"/>
  <input name="email" type="email"/>
  <input name="password" type="password"/>
  <button type="submit">Sign Up</button>
</form>
```

```ts title=api/encoded.ts
import { form } from 'queue-run';

type Fields = {
  email: string;
  name: string;
  password: string;
};

export aync function post({ request }) {
  const { name, email, passowrd } = await form<Fields>(request);
  await createUser({ name, email, password });
  return Response.redirect('/', 303);
}
```

### multipart/form-data

```html title=multipart.html
<form method="post" enctype="multipart/form-data">
  <input type="text" name="name"/>
  <input type="file" name="photo" accepts="image/*">
  <button type="submit">Sign Up</button>
</form>
```

```ts title=api/multipart.ts
import { form, File } from 'queue-run';
import filesize from 'filesize';

type Fields = {
  name: string;
  photo: File;
}

export aync function post({ request }) {
  const { name, photo } = await form<Fields>(request);
  console.log("Name:  %s", name);
  console.log("Photo: %s type %s size %s", photo.name, photo,type, filesize(photo.size));
  await fs.writeFile(photo.filename, photo);
}
```

```
Name:  Assaf Arkin
Photo: avatar.png of type image/png size 1.4 MB
```

## export const config

You can control some aspect of the request handler by exporting `config` object with the following properties, all optional:

- `accepts` — Accepted content types, eg `config.accepts = ["application/json"];` (default "\*/\*")
- `cache` — Add this `Cache-Control` header to the response (string), or cache the response for this many seconds (number), or function called with the response value
- `cors` — True if this route supports CORS and should return apporpriate headers (default: true)
- `etag` — If true adds `ETag` header based on the content of the response (default: true)
- `methods` — Supported HTTP methods, only  when exporting the default request handler (default: "\*")
- `timeout` — Timeout for processing the request, in seconds (default: 10 seconds)

For example:

```ts
export const config =  {
  // This resource only accepts JSON documents
  accepts: "application/json",
  // Cache responses for 60 seconds
  cache: 60,
  // Extend timeout to 45 seconds
  timeout: 45
};
```

## Cache-Control

You can handle caching yourself. The default behavior only kicks in for GET/HEAD/PUT/PATCH requests that respond with status code 200.

To set caching to a given duration:

```ts
export const config =  {
  cache: 60 // 60 seconds = 1 minute
};
```

To change caching based on the response:

```ts
export async function get({ params }) {
  const task = await db.findOne(params.id);
  if (!task) throw new Response(null, { status: 400 });
  return task;
}

export const config =  {
  // Status of completed task doesn't change, cache for 24 hours
  cache: (task) => task.completed ? 86400 : false,
  etag: (task) => task.version
};
```

## Logging Middleware

Routes support the following logging middleware:

- `onRequest(request)` — Called on every request
- `onResponse(request, response)` — Called on every response
- `onError(error, request)` — Called if the request handler throws an error (including timeout)

The default middleware logs responses and errors.

You can change the middleware for a given route by exporting functions with any of these names, or `null` to disable the middleware.

You can use the same middleware across all route by exporting it from `_middleware.ts` in the same directory or parent directory.

The most specific middleware is always used:

- Middleware exported by the request handler module
- Middleware exported by `_middleware.ts` in the current directory
- Middleware exported by `_middleware.ts` in the parent directory
- The default middleware

Your middleware can wrap the default middleware.

For example:

```ts title=api/_middleware.ts
// We're going to use the default middleware for logging
import { logResponse, logError } from 'queue-run';
// And count running/failed requests
import { metrics } from 'metrics';

export async function onRequest(request, response) {
  await logResponse(request, response);
  await metrics.increment(`request.${request.method}`);
}

export async function onResponse(request, response) {
  await logResponse(request, response);
  await metrics.increment(`response.${response.status}`);
}

export async function onError(error, request) {
  await logError(error, request);
  await metrics.increment(`error`);
}
```

:::note Throwing Error or Response

* `onRequest` is called before authentication so does not have access to the current user
* `onRequest` can prevent the request from being handled by throwing a `Response` object (eg 404 or redirect to different URL)
* `onResponse` can change the response by throwing a new `Response` body
* If the request handler throws an `Error`, then 500 response is logged (`onResponse`) as well as the error (`onError`).
* If `onResponse` throws an `Error`, then the server responds with 500
:::