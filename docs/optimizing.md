# Optimizing


## Reserved Concurrency

[Reserved concurrency](https://docs.aws.amazon.com/lambda/latest/operatorguide/reserved-concurrency.html) places an upper limit on the number of active instances.

Reserved concurrency guarantees that your backend can scale to that many instances, regardless of the load on other Lambda functions. Backends that don't have a reserved concurrency, all share the same finite pool.

You can also use reserved concurrency to limit concurrency for your backend, as a way to avoid unexpected usage charges. This is not a replacement for throttling and usage limit, but it helps.

You can also set the reserved concurrency to zero, to pause your backend, for example, to perform database maintenance.

```bash
# This backend splits available instances with
# other Lambda in the same AWS account
npx queue-run reserve off
```

```bash
# This backend has a guaranteed capacity of 50 instances
npx queue-run reserved 50
```

```bash
# This backend is temporarily not available
npx queue-run reserved 0
# We'll upgrade out database name
...
```

Use `npx queue-run status` to see the current reserved concurrency.

Use `npx queue-run metrics lambda` to see performance metrics. You can see how many concurrent executions were used in a given time period. This metrics shows the maximum.

You can also see how many invocations were throttled due to lack of available concurrency. This metrics shows the sum for the time period.


## Provisioned Concurrency

[Provisioned concurrency](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html) maintains a pool of warmed up instances.

Lambda performance is solid for most applications. The most noticeable issue is the warm up time. It needs at least 3 seconds to warm up a new instance, longer for more complicated code.

QueueRun on its part does not load the entire backend at once, only enough code to serve the current request.

Use provisioned concurrency to keep a number of instances idle and ready to service incoming requests. (AWS will charge you for idle item, so watch your usage metrics)

```bash
# Keep 5 instances warmed up
npx queue-run provisioned 5
```

```bash
# Shutdown the provisioned instances
npx queue-run provisioned 0
```

Use `npx queue-run status` to see the current provisioned concurrency.



## Warm-up Function

If you opted into provisioned concurrency, you will want to do warm up work before the request handler gets involved. For tasks like opening database connections, downloading dynamic resources and data, etc.

You can write that code in the module `index.ts`. For example:

```ts title=index.ts
import { Connection } from "db";

// highlight-next-line
export const connection = new Connection(process.env.DB_URL);
```

```ts title=api/index.ts
import { connection } from "../index.js";

export async function get() {
  const records = await connection.query('SELECT * FROM table');
  return { records };
}
```

:::tip
You can use this without provisioned concurrency as well. It's a way to structure the code, placing common resources (database connections, settings, etc) in `index.ts`.
:::

If you want to be more specific, you can export a `warmup` function. For example:

```ts title=index.ts
import db from "#lib/db.js";
import type { Settings } from "#lib/types.d.ts";

// This is called before request/job handler
export async function warmup() {
  // highlight-next-line
  settings = await db.settings.find();
}

// When api/index imports this, settings would be undefined
// When the get request handle runes, settings would have a value
export let settings : Settings;
```

```ts title=api/index.ts
import { settings } from "../index.js";

export async function get() {
  // warmup function already executed, so settings has a value
  // highlight-next-line
  return settings;
}
```

:::tip Warmed-up Exports
This works because QueueRun calls the `warmup` function and waits for it to complete before allowing the request handler to proceeed. And ESM imports, unlike CommonJS, allow the imported module to change the value of an exported variable.
:::

:::info Queues
Typically you don't have to worry about the warm up time for queues, as queues are designed to offload work that takes longer than a few seconds.

Warm up code should only be concerned with resources used by HTTP and WebSocket requests that need a fast response time.
:::



## Concurrency and Isolation

When it comes to HTTP/WS requests, Lambda will run as many instances as there are concurrent requests. Your code will be handling one request at a time.

This is different from typical Node servers that handle multiple requests concurrently in the same process.

FIFO queues could run multiple jobs in the same process, but sequentially.

If one request times out, the backend will be allowed to process the next request. In this case, it will be handling two requests concurrently.

For one of these, the server responded with status code 504, WebSocket error, or returns the job back to the queue. Use the [abort signal](Timeout) to detect and stop processing timed-out requests.

:::tip Database Proxy

When each process handles one request at a time, you don't neeed a database connection pool, and typically serverless applications run with a pool size of 1.

Since there are many instances (processes) that open connections to the database, the connection pool needs to exist on a separate server. If you max database connections look into [database proxies](https://aws.plainenglish.io/aws-rds-proxy-for-serverless-898ed238d91a).
:::

