# Building HTTP APIs

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

- `request` - The HTTP [Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object
- `cookies` - Object with all cookies included in the request (eg `{ session: "1def…" }`)
- `params` - Object with request parameters from the URL (eg `{ id: "123" }`)


## HTTP methods

You can response to HTTP methods in one of two ways. By exporting a function for each method the route supports, or by exporting a default request handler.

For example:

```js
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
  return item;
}

// HTTP DELETE, since "delete" is a keyword in JavaScript,
// we shortern to "del"
export async function del({ params }) {
  await db.remove(params.id);
  return new Response(null, { status: 204 });
}
```

You should know:

* The route will only accept method explicitly exported, and respond with 405 (Method Not Allowed) to all other requests
* `delete` is a reserved keyword in JavaScript, so shorten it to `del`
* For HEAD requests, if there's no `head` function, it will use the `get` function instead
* For OPTIONS requests, `Access-Control-Allow-Methods` will list allowed methods
* If you want to handle the OPTIONS request yourself, you need to turn off CORS (`config.cors`)
* You cannot use `config.methods` in this configuration

You can handle all methods from the default export:

```js
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

```js
export const config = {
  methods: ['GET', 'PUT', 'DELETE']
};
```

## Content types

A typical API would be JSON all the way and not care much about checking and negotiating content type.

The [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) makes it really easy to parse JSON requests. QueueRun will accept any object you return and convert it into a JSON response for you.

So the common use case is as simple as:

```js
export async function post({ request }) {
  const { message } = await request.json();
  return { message };
}

// curl http://localhost:8000/ -d '{ "message": "Hi" }'
// {"messge":"Hi"}
```

If the response is any other media type, you can get it as raw buffer (`response.buffer()`) or plain text (`response.text()`).

There's a convenience method for [working with HTML forms](#the-form-function). And for generating [XML and HTML documents](/xml.md).


## The form() function

If you want to support forms, there's a convenience method that will handle that. For URL encoded form, you'll get the name/value pairs. These typically map to form fields.

Note that the field value can be string (common), or array, if the form includes multiple values of the same field.

For example:

```html
<!-- In the browser -->
<form method="post">
  <input name="name"/>
  <input name="email" type="email"/>
  <input name="password" type="password"/>
  <button type="submit">Sign Up</button>
</button>
```

```ts
// On the server
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

For `multipart/form-data` and requests using [FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData), the value would either be a string, or for files, a [File](https://developer.mozilla.org/en-US/docs/Web/API/File) object.

For example:

```ts
// On the server
import { form, File } from 'queue-run';
import filesize from 'filesize';

type Fields = {
  name: string;
  photo: File;
}

export aync function post({ request }) {
  const { name, photo } = await form<Fields>(request);
  console.log("Name: %s", name);
  console.log("Photo: %s type %s size %s", photo.name, photo,type, filesize(photo.size));
  await fs.writeFile(photo.filename, photo);
}

// Name: Assaf Arkin
// Photo: avatar.png of type image/png size 1.4 MB
```


