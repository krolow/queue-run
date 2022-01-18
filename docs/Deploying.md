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
npx queue-run deploy
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
* `rollback` — Rollback to a previous version

:::note

To keep the `queue-run` module lean, the CLI tools include are available as a separate module. You don't have to add them in `package.json`. They are loaded on demand when you run `npx queue-run` for the first time.
:::

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

* `DEBUG` — Set to `true` to see `console.debug` messages in production, and `false` to hide `console.debug` messags in development (see [Logging](Logging))
* `QUEUE_RUN_INDENT` — Indentation level for JSON and XML output, default to 2 in development, 0 in production

:::tip Keep .env Secret

We don't recommend committing your production `.env` file to version control.

There are many products that work better when you connect them to your GitHub/GitLab/etc repository. In doing so, you're giving them access to your source code, and any secrets contained there. If these services get hacked … well then …
:::


## Configuration Files

Use `npx queue-run init` to generate configuration files for a new project.

### package.json

You don't need to have a `package.json`, but if you do:

* Set `private: true` unless you intend to publish it to the NPM registry
* Set `type: "module"` so you can use CommonJS **and** ESM modules
* You can add `queue-run` as peer dependency, since it's needed to run the project and already available as part of the runtime
* You can set `engines.node` to the specific Node runtime
* The `imports` are a convenience for using absolute instead of relative paths

```json
{
  "engines": {
    "node": "14.x"
  },
  "imports": {
    "#api/*": "./api/*",
    "#lib/*": "./lib/*",
    "#queues/*": "./queues/*",
    "#socket/*": "./socket/*"
  },
  "peerDependencies": {
    "queue-run": "^0.0.0"
  },
  "private": true,
  "scripts": {
    "build": "queue-run build",
    "dev": "queue-run dev",
    "deploy": "queue-run deploy",
    "lint": "eslint **/*.{ts,tsx}"
  },
  "type": "module",
}
```

### tsconfig.json

QueueRun does not use `tsconfig.json`: it only uses `pacakge.json`.

If you're using an IDE like Visual Studio Code, it uses `tsconfig.json` to understand the structure of your TypeScript project.

`npx queue-run init` will generate this file for you, which you can change to add more strict checks.  For example:

```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "jsx": "react-jsx",
    "jsxImportSource": "queue-run",
    "paths": {
      "#api/*": ["./api/*"],
      "#lib/*": ["./lib/*"],
      "#queues/*": ["./queues/*"],
      "#socket/*": ["./socket/*"]
    },
    // highlight-next-line
    "strict": true,
  },
  "include": ["queue-run.env.d.ts", "**/*.ts", "**/*.tsx"]
}
```