# Working with URLs

There are five things the framework should do for you:

* Prevent URLs from breaking when you're moving code around (see [`url.self`](#urlself) below)
* Expand the URL template with path paramters, eg `/items/[id]` + `{ id: 123 }` ⇒ `/items/123`
* Add query string paramters to the URL, eg `/items` + `{ sort: 'desc' }` ⇒ `/items?sort=desc`
* Support type checking for path and query parameters
* Expand paths to absolute urls, eg `/items` ⇒ `https://example.com/items`

We'll see how QueueRun handles all of these use cases with the handy `url` function.

First, the `url` function itself allows you to construct an absolute URL from a template, expanding path parameters and adding query parameters.

```ts
import { url } from 'queue-run';

// The second argument are the path parameters
url("/items/[id]", { id: 123 })
=> https://example.com/items/123

// You can have multiple path parameters
url("/reports/[month]/[day]", { year: 2022, month: "01" })
=> https://example.com/reports/2022/01

// Rest parameter also works
url("/reports/[...date]", { date: ["2022", "01", "15"] })
=> https://example.com/reports/2022/01/15

// The third argument are the query parameters
url("/items", null, { sort: "desc" })
=> https://example.com/items?sort=desc

// A query string parameter can have multiple values
url("/items", null, { category: "work", category: "fun" })
=> https://example.com/items?category=work&category=fun

// External URLs also allowed
url("https://example.org/items/[id]", { id: 123 })
=> https://example.org/items/123
```

## url.for

If you have multiple places where you generate URLs from the same template, you don't want to repeat that template.

You can use a constructor function to keep your code DRY. The constructor function memorizes the URL template, and accepts two arguments: path parameters and query parameters.

```ts
const urlForItem = url.for("/items/[id]");
urlForItem({ id: 123 });
=> https://example.com/items/123
```

Remember how we use filenames as URL templates? In this example, the resource exists in the file `api/items/[id].ts`.

That file is the best place from which to export the URL constructor:

```ts title=api/items/[id].ts
import { url } from "queue-run";

export const urlForItem = url.for("/item/[id]");
```

## url.self

We're still duplicating the URL: once in the filename, twice in the file itself.

ESM allows us to do this:

```ts title=api/items/[id].ts
import { url } from "queue-run";

export const urlForItem = url.for(import.meta.url);
```

This is such a common use case, we can simplify it:

```ts title=api/items/[id].ts
import { url } from "queue-run";

export const urlForItem = url.self();
```

What happens if we rename `api/items/[id].ts` to `api/item/[id].ts`?

If you use an IDE, it will update every place where you import `urlForItem` from this module. And `url.self()` will always use the correct URL template!

## Type Checking

Finally, let's add some type checks to our URLs:

```ts title=api/items/[id].ts
import { url } from "queue-run";

export const urlForItem = url.self<{ id: number }>();
```

```ts title=api/items/index.ts
import { urlForItem } from "./[id].js";

// Type error if id is missing or not a number!
urlFormItem({ id });
```

Type checking works for `url.for` and `url.self`. The first type is for the path parameters, and the second path for query parameters:

```ts
export const urlForReport = url.self(<
  { date: string },
  { sort?: "asc" | "desc" }
>);
```

Hopefully `url.self` and type checking will help spare you from common editing bugs.
