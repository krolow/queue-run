
# Deploying Your Project

Start here:

```bash
npx queue-run deploy
```

Deployment will complete with a message like:

```
 HTTP      : https://qfulfyb2aj.execute-api.us-east-1.amazonaws.com
 WebSocket : wss://1ujp1prs9j.execute-api.us-east-1.amazonaws.com

Try:
  curl https://qfulfyb2aj.execute-api.us-east-1.amazonaws.com

🐇 Done in 16s
```

You can use `curl` to check that your backend works as expected.

```bash
curl https://qfulfyb2aj.execute-api.us-east-1.amazonaws.com
=> { message: "👋 Hello world!" };
```

Check the status of your project and watch the logs:

```bash
npx queue-run status
npx queue-run logs
```


## Commands

These commands are for deploying, monitoring, and managing projects in production.

These commands need the project name, AWS credentials, etc.

The first time you run a command, it will ask you for all that information, and store it in the file `.queue-run.json`. The next command you run will pull settings from this file.

We recommend you do not check this file into source control.

```bash
echo ".queue-run.json" >> .gitignore
```


### deploy

Deploy your project to production.

```bash
npx queue-run deploy
```

When deploying from the command line, this is an opportunity to set up `.queue-run.json`, so other commands can use the same configuration.

When deploying from CI/CD, we [recommend this approach](#cicd).


### domain

Use this command to add/remove custom domains.

```bash
npx queue-run domain add grumpy-sunshine.com
```

See [Custom Domains](#custom-domains).


### env

Use this command to manage environment variables in production.

```bash
npx queue-run env ls
npx queue-run env get <name>
npx queue-run env set <name> <value>
npx queue-run env remove <name>
```

See [Environment Variables](#environment-variables).


### logs

Watch the server logs.

```bash
npx queue-run logs
```

See [Visibility](#visibility).


### metrics

Use this command to see recent metrics for Lambda invocations, HTTP requests, WebSocket connections, queued jobs, and scheduled jobs.

```bash
npx queue-run metrics lambda
npx queue-run metrics http
npx queue-run metrics ws
npx queue-run metrics queue <name>
npx queue-run metrics schedule <name>
```

See [Visibility](#visibility).


### policy

Prints out the AWS policy for deploying a project.

```bash
npx queue-run policy
```

See [Credentials and Policies](#credentials-and-policies).

### provisioned

Changes the [provisioned concurrency](optimizing.md#provisioned-concurrency).

```bash
npx queue-run provisioned 2
npx queue-run provisioned off
```

### queue

You can use this command to queue a job in production.

You need to add the `--prod` option:

```bash
npx queue-run queue --prod <name> [payload]
npx queue-run queue --prod <name> @filename
npx queue-run queue --prod <name> -
```

You can provide the job payload as:

* Command line argument following the queue name
* From a file, using a command line argument like `@my_job.json`
* From standard input, using the command line argument `-`
* From the terminal, QueueRun will prompt you

For a FIFO queue, you also need to specify the group ID using the `--group` option.


### reserved

Changes the [reserved concurrency](optimizing.md#reserved-concurrency).

```bash
npx queue-run reserved 10
npx queue-run reserved 0
npx queue-run reserved off
```

### rollback

Broke something? Rollback to a previous version.

```bash
npx queue-run rollback
```

This command lets you pick an earlier version and rollback is instantenous.

:::info Queues and Schedules

Rolling back only affects which version of your backend runs. It does not restore queues or update schedules.

If you made any of these changes to your project, and you want to revert them, you have to go back to previous version of the code and use the `deploy` command.
:::


### schedule

You can use this command to trigger a scheduled job in production at any time.

You need to add the `--prod` option:

```bash
npx queue-run schedule --prod <name>
```


### status

This command shows status information about your current project: version, configuration, concurrency, HTTP and WebSocket URLs, queues, and schedules.

```bash
npx queue-run status
```

See [Visibility](#visibility).



## Custom Domains

When adding a custom domain, QueueRun will guide you through the process of verifying ownership, and updating your DNS to the new endpoints.

You can verify your domain in one of two ways:

- dns — Recommended, expect this to take a few minutes (DNS propagation)
- email — You need to be able to receive email on the domain you're verifying

This command is idempotent, so if you have to stop it, when you run it again it will pick where it left off.

QueueRun will create a TLS certificate for you. Your HTTP API will be available on the main domain, while WebSocket uses the sub-domain `ws`.

:::note
Your backend is not aware of the new domain until you re-deploy the project.
:::


## Environment Variables

Use `npx queue-run env` to manage environment variables in production.

For example:

```bash
npx queue-run env add DATABASE_URL postgres://...
npx queue-run env add API_TOKEN eyBob3...
npx queue-run env list
```

The following environment variabels are always available:

* `NODE_ENV` — Either "production" or "development"
* `QUEUE_RUN_URL` — URL for the HTTP API, same as `url('/')` in code
* `QUEUE_RUN_WS` — URL for WebSocket, same as `socket.url` in code
* `QUEUE_RUN_ENV` — Either "production" or "development"

QueueRun understands the following environment variables:

* `DEBUG` — Set to `true` to see `console.debug` messages in production, and `false` to hide them in development (see [Logging](logging.md))
* `QUEUE_RUN_INDENT` — Indentation level for JSON and XML output, default to 2 in development, 0 in production

If you need to temporarily change an environment variable:

```bash
npx queue-run deploy -e DEBUG=true
```

To  dump server environment variables so you can use them locally:

```bash
# save to .env
npx queue-run env list > .env
# use .env
npx queue-run dev
```

:::note Change -> Deploy
After changing environment variables, you need to redeploy your project to use the new environment variables.
:::


## CI/CD

The recommended setup for CI/CD:

* Create an IAM user for your build system with [the proper credentials](#credentials-and-policies)
* The build server sets the `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` environment variables
* Do not use `.queue-run.json`, set project name from the command line
* Use the [`env`](#environment-variables) command to manage environment variables for your backend

GitHub workflow could look like this:

```yaml
name: Deploy My Back-end
on: push

jobs:
  upload:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: "14"
          cache: "yarn"
      - run: yarn install
      - env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: ${{ secrets.AWS_REGION }}
        run: npx queue-run deploy my-backend
```

Successful deployments will appear in the log:

```
npx queue-run logs
2/2/2022, 12:42:28 PM: Uploaded new version arn:aws:lambda:us-east-1:12##########:function:qr-grumpy-sunshine:340
2/2/2022, 12:42:33 PM: Switched to new version arn:aws:lambda:us-east-1:12##########:function:qr-grumpy-sunshine:340
```


## Credentials and Policies

### For Deploying

In order to deploy a project, set custom domain, watch the logs, etc you need an IAM account with a policy that has all the deploy permissions.

If you're using an account with broad permissions, not a problem. If you want to create an IAM account with a specific policy, use the `npx queue-run policy` command:

```bash
npx queue-run policy --output policy.json
aws iam put-user-policy \
  --user-name assaf \
  --policy-name queue.run \
  --policy-document 'file://policy.json'
```

### For The Backend

The project you deploy will have its own role and policy. This policy is even narrower, it only grants the backend necessary access to queues, database, logs, etc.

In your backend, you may want to use other AWS services — S3, DynamoDB, SES, etc. Creating and managing these users/roles is up to you.

The AWS SDK will need the access key ID and secret, as well as region. You can set these as environment variables.

For example:

```bash
# Backend needs access to DynamoDB and S3
npx queue-run env add AWS_ACCESS_KEY_ID "AKI..."
npx queue-run env add AWS_SECRET_ACCESS_KEY "v…"
npx queue-run env add AWS_REGION "us-east-1"
```


## Visibility

### Status

Use the `status` command to see the current status of your project:

* When your backend was deployed, version number, code size, region, etc
* Reserved and provisioned concurrency (see [Optimizing](optimizing.md))
* HTTP and WebSocket URLs
* Queues, showing number of jobs processed, in flight, and age of oldest job in the last 5 minutes
* Schedules, showing when the scheduled job ran last time, and when it's expected to run again

```
 Name         : grumpy-sunshine
────────────────────────────────────────────────────
 Version      : 358
 Code size    : 1.27 MB (compressed)
 Deployed     : 2/2/2022, 9:52:30 PM
 Region       : us-east-1
 Avail memory : 5.12 GB
 Timeout      : 15m
 Reserved     : no reserve
 Provisioned  : IN_PROGRESS
 — Requested  : 2
 — Allocated  : 0
 — Available  : 0

 HTTP         : https://grumpy-sunshine.queue.run
 WebSocket    : wss://ws.grumpy-sunshine.queue.run
```


### Logs

Use the `logs` command to watch the server logs.

You can use Ctrl+C to stop, and Ctrl+L to clear the screen.

If you only want to retrieve the latest logs, use `--no-watch` in combination with `--hours`.

:::note

There's typically a few seconds delay between when the logs are created and when they appear on the screen.
:::


### Metrics

Use the `metrics` command to see metrics about:

* Lambda: invocations, throttled requests, errors, concurrency, execution duration
* HTTP: requests, 4xx and 5xx responses, response time
* WebSocket: new connections, messages sent and received, errors, response time
* Queues: jobs queued, jobs processed, in-flight, and age of oldest message
* Schedules: scheduled jobs invocations and failed invocations

The default time range is the last 12 hours. You can change the time range with the `--range` option:

```bash
# Last 30 minutes, resolution is 1 minute
npx queue-run metrics --range 30m

# Last 8 hours, resolution is 10 minutes
npx queue-run metrics --range 8h

# Last 30 days, resolution is 1 day
npx queue-run metrics --range 30d
```
