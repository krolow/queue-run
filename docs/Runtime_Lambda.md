# AWS Lambda + SQS

## Lambda Warm Up

Lambda performance is solid for most applications.

The most noticeable issue is the warm up time. It needs at least 3 seconds to warm up a new instance, and it could be much longer depending on what the code does.

[Provisioned concurrency](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html) can help by keeping instances around, in a state ready to respond to new requests.

If you opted into provisioned concurrency, you will want to do warm up work before the request handler gets involved. For things like opening database connections, downloading dynamic resources and data, etc.

You can write that code in the module `warmup.ts`. For example:


```ts title=warmup.ts
import { Connection } from 'db';

// highlight-next-line
export const connection = new Connection(process.env.DB_URL);
```

```ts title=api/index.ts
import { connection } from '../warmup.js';

export async function get() {
  const records = await connection.query('SELECT * FROM table');
  return { records };
}
```

This works because QueueRun loads `warmup` once, before handling any requests. This gives time for the database connection object to establish a TCP connection to the database server.

If you want to be more specific, you can export a default function. For example:

```ts title=warmup.ts
import db from '~lib/db.js';
import type { Settings } from '~lib/types.d.ts';

export default async function warmup() {
  settings = await db.settings.find();
}

// Initially these are undefined
export let settings : Settings;
```

```ts title=api/index.ts
import { settings } from '../warmup.js';

export async function get() {
  // warmup function executed, settings has a value
  return settings;
}
```

:::info Queues
Typically you don't have to worry about the warm up time for queues, as queues are designed to offload work that takes longer than a few seconds.

Warm up code should only be concerned with resources used by HTTP and WebSocket requests that need a fast response time.
:::

## Lambda Concurrency

When it comes to HTTP/WS requests, Lambda will run as many instances as there are current requests. This means your node Node is likely only handling one request at a time.

There are two exception to that. FIFO queues run one job at a time (in the same Node process), but standard queues can run multiple jobs concurrently.

Also, if one request times out, the Lambda may start handling the next request. Timeout means the client receives a 504 status code (Gateway Timeout). The code itself may still keep running if it's unaware of the timeout.

:::tip Abort Signal
Use the [abort signal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) to detect when your handler ran out of time.
:::

If your backend is mostly handling HTTP/WS requests, it may not benefit much from having a database connection pool, and you may get around with a single connection, or pool size of 1.

OTOH it would open as many database connections as there are concurrent requests. Many database servers cannot manage multiple open connections, and you need to consider using a database proxy.

:::info Reserved Concurrency
[Reserved concurrency](https://docs.aws.amazon.com/lambda/latest/operatorguide/reserved-concurrency.html) can help limit the number of active instances, but you should still consider a database proxy.
:::
