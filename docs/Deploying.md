---
sidebar_label: "Deploying"
---

# Deploying Your Project

If you've never used QueueRun before, follow this two steps:

```bash
npx queue-run init
```

```bash
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

```
npx queue-run logs
```

:::info AWS Credentials

Right now QueueRun is self-hosted and the only supported runtime is AWS Lambda.

To deploy your project you'll need to use your AWS account credentials:

```bash
export AWS_ACCESS_KEY_ID="AKI..."
export AWS_SECRET_ACCESS_KEY="v…"
export AWS_REGION="us-east-1"
```
:::


## Deployment Commands

If you run `npx queue-run init` in an empty project, it will create `pacakge.json` for you, along with a project template.

If you already setup a project, you still need to use `npx queue-run init` to choose the project name and runtime.

These are stored in the file `.queue-run.json` in the current working directory. Deployment commands (`deploy`, `logs`, etc) need this file.

* `init` - Configure your project and update `.queue-run.json`
* `deploy` — Deploy your project
* `info` — See information about your deployed project (eg HTTP and WebSocket URLs)
* `logs` — Watch server logs

:::note

To keep the `queue-run` module lean, the CLI tools include are available as a separate module. You don't have to add them in `package.json`. They are loaded on demand when you run `npx queue-run` for the first time.
:::