# Development Server

To run the development server:

```bash
npx queue-run dev
```

```
👋 Dev server listening on:
   http://localhost:8000
   ws://localhost:8001
λ: Compiled 10 files and copied 3 files
   Watching for changes (Crtl+R to reload) …
```

The dev server lists on ports 8000 (HTTP) and 8001 (WebSocket). You can change the ports with the `--port` argument or `PORT` environment variable.

The server watches the current working directory and reloads whenever it detects a change.

It only watches over JavaScript, TypeScript and JSON files, and ignores `node_modules`. You can always force it to reload by pressing `Control+R`.

The development server will load environment variables from the file `.env.local` or `.env`.


## Testing Queues

You can test queues directly by running (from a separate terminal window):

```bash
npx queue-run dev queue <queue-name> [body]
```

You can provide the body inline after the queue name, from a file (`@filename`), from stdin (`-`), or `queue-run` will prompt you.

If you're using a FIFO queue, you need to provide the group ID using the `--group` argument.

For example:

```bash
cat job.json
{ "id": 123 }
npx queue-run dev queue screenshots @job.json
```


## Testing WebSocket

You can use CLI tool like [websocat](https://github.com/vi/websocat):

```bash
websocat ws://localhost:8001
```

You can also use authentication with websocat, for example:

```bash
websocat ws://localhost:8001 -H "Authorization: Bearer dcx..."
```

:::note Port 8001

The port number for WebSocket is one more than the port number for HTTP.
:::
