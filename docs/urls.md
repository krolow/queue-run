# Working with URLs

If you want to return a URL as part of the response, you can use the `url` helper.

```ts filename="api/items[id].ts"
// This is api/items/[id].ts
import { url } from 'queue-run';

export const urlForItem = url.self<{ id: string >}();

// Respond with a single item
// (request URL would be something like /items/123)
export async function get() {
  ...
}
```

```ts
// This is api/items/index.ts
const { urlForItem } = require('./[id]');

// Respond with a list of all items
export async function get() {
  const items = await db.find();
  return {
    items: items.map(item => ({
      id: item.id,
      url: urlForItem(item),
    })),
  };
}
```

## The url() function

Let's explain how this works, starting with the `url()` function.

The `url()` function accepts three arguments:

- The resource path (e.g. `/items/[id]`)
- Optional parameters to insert into the path (e.g. `{ id: '123' }`)
- Optional query string parameters (e.g. `{ page: 2 }`)

It uses the notation `/tasks/[id]` for a single value parameter, and `/post/[...slug]` for the variadic parameter. The variadic parameter must come at the end.

The leading slash is optional. The
rest parameter (`...`) must come last.

You can also use Express notation: `/tasks/:id` and `/post/:slug*`.

The `url()` function returns an absolute URL.

Here are some examples:

```js
url('/tasks/[id]', { id: 123 })
// https://example.queue.run/tasks/123

url('/tasks', null, { category: 'abc' })
// https://example.queue.run/tasks?category=abc

url('/tasks', null, { filters: ['abc', 'xyz']  })
// https://example.queue.run/tasks?filters=abc&filters=xyz

url('/post/[...slug]', { slug: ['2021', '12', '28', 'my-post'] })
// https://example.queue.run/post/2021/12/28/my-post
```

## The url.for() function

You can use `url.for(path)` to create a URL construction function.

The same examples using a URL construction function:

```js
const urlForTask = url.for<{ id: string }>('/tasks/[id]');
urlForTask({ id: 123 })
// https://example.queue.run/tasks/123

urlForTask({ id: 123 }, { category: 'abc' })
// https://example.queue.run/tasks/123?category=abc

const urlForPost = url.for<{ slug: string[] }>('/post/[...slug]');
urlForPost({ slug: ['2021', '12', '28', 'my-post'] })
// https://example.queue.run/post/2021/12/28/my-post
```

If you're using TypeScript, you can apply types to the URL construction function:

```ts
const urlForTask = url.for<{ id: string }>('/tasks/[id]');
// No path parameters, but type-checking for query parameters
const urlForList = url.for<never, { page: number }>('/list');
const urlForPost = url.for<
  { slug: string[] },
  { theme: 'light' | 'dark' }
>('/post/[...slug]');
```

## The url.self() function

The `url.self()` function is a shortcut for `url.for(path)` that uses the path of the current file.

These two are equivalent:

```js
// This is api/items/[id].ts
export const urlForItem = url.self<{ id: string }>();
export const urlForItem = url.url<{ id: string }>('/items/[id]');
```

If you keep changing your mind and move resources around, `url.self()` will return the correct URL.