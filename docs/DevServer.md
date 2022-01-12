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


:::note

To keep the `queue-run` module lean, CLI tools include the dev server are available in separate modules. You don't have to add them in `package.json`. They are loaded on demand when you run `npx queue-run` for the first time.
:::