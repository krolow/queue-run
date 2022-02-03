# Development Tools

To run the development server:

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

The dev server lists on port 8000 for HTTP and WebSocket. You can change the ports with the `--port` argument or `PORT` environment variable.

The server watches the current working directory and reloads whenever it detects a change.

It only watches over JavaScript, TypeScript and JSON files, and ignores `node_modules`. You can always force it to reload by pressing `Control+R`.

The development server will load environment variables from the file `.env`, if present.


## Testing Queues

You can test queues directly by running (from a separate terminal window):

```bash
npx queue-run queue <name> [body]
```

You can provide the body inline after the queue name, from a file (`@filename`), from stdin (`-`), or `queue-run` will prompt you.

If you're using a FIFO queue, you need to provide the group ID using the `--group` argument.

For example:

```bash
cat job.json
{ "id": 123 }
npx queue-run queue screenshots @job.json
```


## Testing WebSocket

You can use CLI tool like [websocat](https://github.com/vi/websocat):

```bash
websocat ws://localhost:8000
```

:::note Port 8000

The port number for WebSocket is one more than the port number for HTTP.
:::


## Testing Scheduled Jobs

You can test scheduled job directly by running (from a separate terminal window):

```bash
npx queue-run schedule <name>
```


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