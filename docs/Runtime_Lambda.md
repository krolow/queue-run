---
sidebar_label: "AWS Lambda"
---

# AWS Lambda + SQS + DynamoDB

## AWS Credentials

QueueRun backends deal with three different policies:

* **Deploy** — For deploying projects, setting up custom domains, updating secrets, etc
* **Runtime** — Your backend uses this to access queues, database, etc
* **Backend** — This is up to you for any resources you need to use

To deploy a new project you will need an AWS user with the full deploy policy. You can create such a user and assign them the policy:

```bash
npx queue-run policy --output policy.json
export policy=$(cat policy.json)
aws iam put-user-policy --user-name myname \
  --policy-name queue.run --policy-document '$policy' 
```

When you deploy a backend, QueueRun creates a runtime policy specifically for that backend. You don't have to manage this policy yourself, but you can audit it using the AWS console.

If you want to use additional AWS resources — S3 buckets, DynamoDB tables, etc — then you need a separate IAM user and policy.

The AWS SDK will need the access key ID and secret, as well as region. You can set these as environment variables.

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

You use provisioned concurrency to keep instances warmed up and ready to serve, ahead of expected traffic spikes. [See warm up function](#warm-up-function).

```bash
# Keep 5 instances warmed up even if there's no traffic
npx queue-run provisioned 5
```

```bash

# Shutdown the provisioned instances
npx queue-run provisioned 0
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
