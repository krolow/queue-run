# Performance

## Lambda Warm Up

Lambda performance is solid for most applications.

The most noticeable issue is the warm up time. It needs at least 3 seconds to warm up a new instance, and it could be much longer depending on what the code does.

[Provisioned concurrency](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html) can help by keeping instances around, in a state ready to respond to new requests.

If you opted into provisioned concurrency, you will want to do warm up work before the request handler gets involved. For things like opening database connections, downloading dynamic resources and data, etc.

You can use [top-level await](https://aws.amazon.com/blogs/compute/using-node-js-es-modules-and-top-level-await-in-aws-lambda/) for that.

Your back-end will have multiple modules for all the routes, channels, queues, etc. QueueRun loads these modules on-demand, so you don't have to worry about that.

Any warm-up code is shared across all invocations. You want the warm-up code to take care of any shared resources used by functions that need a fast response time. Typically things like authentication, often used API resources, and WebSockets.

:::info Queues
Typically you don't have to worry about the warm up time for queues, as queues are designed to offload work that takes longer than a few seconds.
:::

## Lambda Concurrency

When it comes to HTTP/WS requests, Lambda will run as many instances as there are current requests. This means your node Node is likely only handling one request at a time.

There are two exception to that. FIFO queues run one job at a time (in the same Node process), but standard queues can run multiple jobs concurrently.

Also, if one request times out, the Lambda may start handling the next request. Timeout means the client receives a 504 status code (Gateway Timeout). The code itself may still keep running if it's unaware of the timeout.

:::tip Abort Signal
Use the [abort signal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) to detect when your handler ran out of time.
:::


If your backend is mostly handling HTTP/WS requests, it may not benefit much from having a database connection pool, and you may get around with a single connection, or pool size of 1.

OTOH it would open as many database connections as there are concurrent requests [^2]. Many database servers cannot manage multiple open connections, and you need to consider using a database proxy.

:::info Reserved Concurrency
[Reserved concurrency](https://docs.aws.amazon.com/lambda/latest/operatorguide/reserved-concurrency.html) can help limit the number of active instances, but you should still consider a database proxy.
:::
