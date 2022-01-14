# Working with URLs

## Simple Example

If you want to return a URL as part of the response, you can use the `url` helper.

```ts title="api/items/[id].ts"
import { url } from 'queue-run';

// highlight-next-line
export const urlForItem = url.self<{ id: string >}();

// The request URL looks like /items/123
export async function get() {
  ...
}
```

```ts title="api/items/index.ts"
import { urlForItem } from './[id].js';

// Respond with a list of all items
export async function get() {
  const items = await db.items.find();
  return {
    items: items.map(item => ({
      id: item.id,
      // highlight-next-line
      url: urlForItem(item),
    })),
  };
}
```

## The url() Function

Let's explain how this works, starting with the `url()` function.

The `url()` function accepts three arguments:

- The resource path (e.g. `/items/[id]`)
- Optional parameters to insert into the path (e.g. `{ id: '123' }`)
- Optional query string parameters (e.g. `{ page: 2 }`)

The `url()` function returns an absolute URL, eg `https://example.com/items/123`;

The format for the resource path:

- `[name]` for a single value parameter, eg `/items/[id]`
- `[...name]` for the rest parameter, eg `/post/[...slug]`
- If you use the rest parameter, it must come at the end of the path
- The leading slash is optional
- You can also use Express notation: `/tasks/:id` and `/post/:slug*`.


Here are some examples:

```ts
url('/tasks/[id]', { id: 123 })
=> https://example.queue.run/tasks/123

url('/tasks', null, { category: 'abc' })
=> https://example.queue.run/tasks?category=abc

url('/tasks', null, { filters: ['abc', 'xyz']  })
=> https://example.queue.run/tasks?filters=abc&filters=xyz

url('/post/[...slug]', { slug: ['2021', '12', '28', 'my-post'] })
=> https://example.queue.run/post/2021/12/28/my-post
```

:::note

You can also use `url()` with an absolute URL, a [URL](https://developer.mozilla.org/en-US/docs/Web/API/URL) object, and even a `file://` URL.
:::


## url.for()

You can use `url.for(path)` to create a URL construction function. You then pass the URL construction around to code that needs to create URLs, but not worry about the path.

Here are some examples:

```js
const urlForTask = url.for('/tasks/[id]');

urlForTask({ id: 123 })
=> https://example.queue.run/tasks/123

urlForTask({ id: 123 }, { category: 'abc' })
=> https://example.queue.run/tasks/123?category=abc

const urlForPost = url.for('/post/[...slug]');

urlForPost({ slug: ['2021', '12', '28', 'my-post'] })
=> https://example.queue.run/post/2021/12/28/my-post
```

If you're using TypeScript, you can apply types to the URL construction function:

```ts
const urlForTask = url.for<{ id: string }>('/tasks/[id]');

// No path parameters, but type-checking for query parameters
const urlForList = url.for<never, { page: number }>('/list');

const urlForPost = url.for<
  { slug: string[] },
  { theme?: 'light' | 'dark' }
>('/post/[...slug]');
```



## url.self()

The `url.self()` function is a shortcut for `url.for(path)` that uses the path of the current file.

These  are equivalent:

```ts title="api/items/[id].ts"
export const urlForItem = url.self();

export const urlForItem = url.url('/items/[id]');

export const urlForItem = url.url(import.meta.url);
```

:::info Safe To Rename

The convenience of `url.self()` is when you rename files, your URLs change and don't break.

For example, if you rename `items/[id].ts` to `item/[id].ts` (plural to singular), or `items/[itemId].ts` (parameter name). You don't need to change any of the code.
:::
