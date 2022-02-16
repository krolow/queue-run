# Development Tools

Start here:

```bash
npx queue-run dev
```

```
👋 Dev server listening on:
   http://localhost:8000
   ws://localhost:8000
✔ Compiled 11 files and copied 5 files
✔ Created manifest
   Watching for changes (Crtl+R to reload) …
```

The server watches the current working directory and reloads whenever it detects a change.


## Commands

The following commands are used for development.


### build

This command builds the current project but does not deploy it.

```bash
npx queue-run build
```

It will attempt to transpile and load the code, so would detect syntax error and broken imports.

It will also output the project manifest, so you can audit it. For example:


```
 HTTP API
───────────────────────────────────────────
 /               →  api/index.tsx
 /bookmarks[id]  →  api/bookmarks/[id].ts
 /bookmarksfeed  →  api/bookmarks/feed.tsx
 /bookmarks      →  api/bookmarks/index.ts

 WebSocket
───────────────────────────────────────────
 /               →  socket/index.ts

 Queues
───────────────────────────────────────────
 screenshots     →  queues/screenshots.ts

 Schedules
───────────────────────────────────────────
 0 0 * * *       →  schedules/daily.ts
```


### dev

This command runs the development server.

```bash
npx queue-run dev
```

The dev server lists on port 8000 for HTTP and WebSocket.

You can change the ports with the `--port` argument or `PORT` environment variable. Other commands (`queue`, `schedule`) would need to know that port number.

You can press Ctrl+C to exit the server, Ctrl+R to force a reload, and Ctrl+L to clear the screen.

The development server will load environment variables from the file `.env` file. You can also set environment variables with the `-e` option.


### init

Use this to initialize a new project.

```bash
npx queue-run init
```

It will ask you a few questions and then create appropriate files. See [Project Files](#project-files).


### dev queue

You can use this command to test a queued job using the dev server.

```bash
npx queue-run dev queue <name> [payload]
npx queue-run dev queue <name> @filename
npx queue-run dev queue <name> -
```

You can provide the job payload as:

* Command line argument following the queue name
* From a file, using a command line argument like `@my_job.json`
* From standard input, using the command line argument `-`
* From the terminal, QueueRun will prompt you

For a FIFO queue, you also need to specify the group ID using the `--group` option.


### dev schedule

You can use this command to test a scheduled job using the dev server.

```bash
npx queue-run dev schedule <name>
```


## Project Files

Use `npx queue-run init` to generate these files for a new project.

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
    "#schedules/*": "./schedules/*",
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
      "#schedules/*": ["./schedules/*"],
      "#socket/*": ["./socket/*"]
    },
    // highlight-next-line
    "strict": true,
  },
  "include": ["queue-run.env.d.ts", "**/*.ts", "**/*.tsx"]
}
```

### .env

Use this file to store environment variables for your backend when running in development.

The format for this file is `name=value` pairs, but it does support comments, and multi-line values:

```dosini
# This is a comment
SECRET_KEY=YOURSECRETKEYGOESHERE # comment
SECRET_HASH="something-with-a-#-hash"
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...
Kh9NV...
...
-----END DSA PRIVATE KEY-----"
```

Use the [`env` command](deploying#environment-variables) to manage environment variables for your backend in production.


### index.ts

This file is shared by all backend resources (HTTP, queues, etc), use this for:

* [Error logging](logging#logging-errors)
* [Increasing available memory](optimizing#available-memory)
* [Using a logging service](logging#using-a-logging-service)
* [Warm-up function](optimizing#warm-up-function) that runs before any other task


## Testing WebSocket

You can use CLI tool like [websocat](https://github.com/vi/websocat):

```bash
websocat ws://localhost:8000
```
