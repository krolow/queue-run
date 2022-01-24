---
sidebar_label: "AWS Lambda"
---

# AWS Lambda + SQS + DynamoDB

## AWS Credentials

You have to think in terms of three permission models:

* **Deploy** — Permissions necessary to deploy the project
* **Runtime** — Permissions available to the QueueRun runtime
* **Backend** — Permissions available to your backend

QueueRun uses your AWS access key to deploy the backend. That access key needs to be able to deploy Lambda function, setup API Gateway, create SQS queues, and manage DynamoDB tables.

The backend deploys as a Lambda function. That function needs read/write access to SQS queues, select DynamoDB tables (WebSockets), and logging to CloudWatch.

The QueueRun runtime uses an AWS access key that's limited to this policy. It cannot access other AWS resources on your account.

By default, your backend does not have an AWS access key. For your backend to use AWS resources, create a policy and the appropriate AWS access key. Then set the apporpriate environment variables.

For example:

```bash
cat .env.production
# Backend needs access to DynamoDB and S3
AWS_ACCESS_KEY_ID="AKI..."
AWS_SECRET_ACCESS_KEY="v…"
AWS_REGION="us-east-1"
```


## Concurrency Control

You have two ways to control concurrency:

* [Reserved concurrency](https://docs.aws.amazon.com/lambda/latest/operatorguide/reserved-concurrency.html) places an upper limit on the number of active instances
* [Provisioned concurrency](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html) maintains a pool of warmed up instances

You can use reserved concurrency to limit how many instances of your backend are active at once. Some use cases:

* Reserved concurrency guranteed to this backend, not affected by load on other Lambda functions
* Limit concurrency to avoid unexpected usage charges
* Pause your backend by setting the reserved concurrency to zero, eg during database maintenance

You use provisioned concurrency to keep instances warmed up and ready to serve, ahead of expected traffic spikes. [See warm up function](#warm-up-function).

To use provisioned and/or reserved concurrency, you have to set them up during deployment:

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
# Good time for database maintenance
```


## Warm-Up Function

Lambda performance is solid for most applications.

The most noticeable issue is the warm up time. It needs at least 3 seconds to warm up a new instance, and it could be much longer depending on what the code does.

[Provisioned concurrency](#concurrency-control) can help by keeping instances around, in a state ready to respond to new requests.

If you opted into provisioned concurrency, you will want to do warm up work before the request handler gets involved. For things like opening database connections, downloading dynamic resources and data, etc.

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

This works because QueueRun loads `index.js` once, before handling any requests. This gives time for the database connection object to establish a TCP connection to the database server.

If you want to be more specific, you can export a `warmup` function. For example:

```ts title=index.ts
import db from "#lib/db.js";
import type { Settings } from "#lib/types.d.ts";

// This is called before request/job handler
export async function warmup() {
  settings = await db.settings.find();
}

// Initially these are undefined
export let settings : Settings;
```

```ts title=api/index.ts
import { settings } from "../index.js";

export async function get() {
  // warmup function executed, settings has a value
  return settings;
}
```

:::info Queues
Typically you don't have to worry about the warm up time for queues, as queues are designed to offload work that takes longer than a few seconds.

Warm up code should only be concerned with resources used by HTTP and WebSocket requests that need a fast response time.
:::



## Concurrency/Isolation

When it comes to HTTP/WS requests, Lambda will run as many instances as there are current requests. This means your node Node is likely only handling one request at a time.

There are two exception to that. FIFO queues run one job at a time (in the same Node process), but standard queues can run multiple jobs concurrently.

Also, if one request times out, the Lambda may start handling the next request. Timeout means the client receives a 504 status code (Gateway Timeout). The code itself may still keep running if it's unaware of the timeout.

:::tip Abort Signal
Use the [abort signal](Timeout) to detect when your handler ran out of time.
:::
