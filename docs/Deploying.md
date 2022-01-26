
# Deploying Your Project

If you've never used QueueRun before, follow this two steps:

```bash
npx queue-run init
```

The `init` command will ask you for the project name and other settings and store them in `.queue-run.json`.

```bash
export AWS_ACCESS_KEY_ID="AKI..."
export AWS_SECRET_ACCESS_KEY="v…"
npx queue-run deploy
```

Deployment will complete with a message like:

```
Your API is available at:	https://qfulfyb2aj.execute-api.us-east-1.amazonaws.com
WebSocket available at:		wss://1ujp1prs9j.execute-api.us-east-1.amazonaws.com
Try:
  curl https://qfulfyb2aj.execute-api.us-east-1.amazonaws.com
🐇 Done in 16s
```

You can use `curl` to check that your backend works as expected.

```bash
curl https://qfulfyb2aj.execute-api.us-east-1.amazonaws.com
=> { message: "👋 Hello world!" };
```

To watch the logs:

```bash
npx queue-run logs
```


## Deployment Commands

The following commands are available to deploy and manage your project:

* `deploy` — Deploy your project
* `domain` — Add and remove custom domains
* `info` — See information about your deployed project (eg HTTP and WebSocket URLs, concurrency)
* `init` - Configure your project and update `.queue-run.json`
* `logs` — Watch server logs
* `policy` — Print out [the AWS policy](#credentials-and-policies) for deploying a project 
* `provisioned` — Change the [provisioned concurrency](Optimizing.md#provisioned-concurrency)
* `reserved` — Change the [reserved concurrency](Optimizing.md#reserved-concurrency)
* `rollback` — Broke something? Rollback to a previous version


:::note
To keep the `queue-run` module lean, the CLI tools include are available as a separate module. You don't have to add them in `package.json`. They are loaded on demand when you run `npx queue-run` for the first time.
:::


## Custom Domains

To use a custom domain:

```bash
npx queue-run domain add example.com
```

You can verify your domain in one of two ways:

- dns — Recommended, expect this to take a few minutes (DNS propagation)
- email — You need to be able to receive email on the domain you're verifying

QueueRun will create a TLS certificate for you. Your HTTP API will be available on the main domain, while WebSocket use the sub-domain `ws`.

Your backend is not aware of the new domain until you re-deploy the project.


## Environment Variables

You can deploy your project with environment variables using an `.env.*` file.

Use `.env.production` for production and `.env.local` for development.

The `.env.*` file would look something like:

```
DATABASE_URL=postgresql://localhost/main
API_TOKEN=eyBob3cgYXJlIHlvdSBkb2luZyB0b2RheT8gfQ==
```

The following environment variabels are always available:

* `NODE_ENV` — Either "production" or "development"
* `QUEUE_RUN_URL` — URL for the API, same as `url('/')`
* `QUEUE_RUN_WS` — URL for WebSocket, same as `socket.url`
* `QUEUE_RUN_ENV` — Either "production" or "development"

QueueRun understands the following environment variables:

* `DEBUG` — Set to `true` to see `console.debug` messages in production, and `false` to hide `console.debug` messags in development (see [Logging](Logging.md))
* `QUEUE_RUN_INDENT` — Indentation level for JSON and XML output, default to 2 in development, 0 in production

:::tip Keep .env Secret

We don't recommend committing your production `.env` file to version control.
:::


## Credentials and Policies

In order to deploy a project, set custom domain, watch the logs, etc you need an IAM account with a policy that has all the deploy permissions.

If you're using an account with broad permissions, not a problem. If you want to create an IAM account with a specific policy, use the `npx queue-run policy` command:

```bash
npx queue-run policy --output policy.json --project grumpy-sunshine

export policy=$(cat policy.json)
aws iam put-user-policy --user-name assaf \
  --policy-name queue.run --policy-document '$policy' 
```

The project you deploy will have its own role and policy. This policy is even narrower, it only grants the backend necessary access to queues, database, logs, etc.

In your backend, you may want to use other AWS services — S3, DynamoDB, SES, etc. Creating and managing these users/roles is up to you.

The AWS SDK will need the access key ID and secret, as well as region. You can set these as environment variables.

For example:

```bash
cat .env.production
# Backend needs access to DynamoDB and S3
AWS_ACCESS_KEY_ID="AKI..."
AWS_SECRET_ACCESS_KEY="v…"
AWS_REGION="us-east-1"
```
