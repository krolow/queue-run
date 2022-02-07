# JavaScript, TypeScript, ESM

## JavaScript and TypeScript

You can write your backend in JavaScript, TypeScript, or combination of both.

QueueRun will transpile the code for you, so you can take advantage of the latest language features.

JSX/TSX is also supported for [generating HTML/XML](xml).

You can use TypeScript to add type checking, for example:

```ts
// Type checking for URL constructors
const urlForItem = url.for<{ id: string }>('/item/:id');

// Type checking for queues
const updateQueue = queue.get<Item>('update.fifo');
```

You don't need to do anything to support TypeScript. However, IDEs like VSCode work better if you have `tsconfig.json`.

:::tip npx queue-run init

Use `npx queue-run init` in an empty directory, and it will create a `tsconfig.json` with [the recommended setup](developing#tsconfigjson).
:::


## ESM Modules (and CommonJS)

QueueRun supports ESM modules so you can take advantage of Node modules that only support ESM, and better import mechanism.

ESM modules can import CommonJS modules (but not vice versa).

To use ESM modules:

* Make sure your project's `package.json` specifies `type: "module"`
* Use `import` and `export` instead of `require` and `module.exports`
* Imports must use the filename extension `.js` (even TypeScript code)
* If you need to use `require`: `module.createRequire(module.meta.url)`

ESM also supports import paths, so you can import `#queue/my_queue.js`, `#lib/some_lib.js`, etc.

QueueRun is ESM, so if your project is CommonJS, code is still compiled to ESM, but you have to use the filename extension `.mjs` when importing.

:::tip npx queue-run init

Use `npx queue-run init` in an empty directory, and it will create a `package.json` with [the recommended setup](developing#packagejson).
:::