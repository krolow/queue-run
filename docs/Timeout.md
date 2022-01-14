---
sidebar_label: "Timeout/Abort"
---

# Timeout and Abort Signal

Each task is given a finite time to complete. The default timeout depends on the task: 10 seconds for HTTP and WebSocket requests, 5 minutes for queued and scheduled jobs.

You can change the timeout by exporting `export const config = { timeout: inSeconds };`.

A responsive API should respond in matter of milliseconds, with few requests taking longer than that. If you intend to do a lot of processing, use [queues](Queues).

When the request times out, the server responds with status code 504. This tells the client their request has not completed, and they can repeat it, show an error to the user, etc.

For WebSocket, you can send the client a message at any time, from another request or queued job. The WebSocket request does not have to complete with a response.

If the WebSocket request times out, that's treated as an error, and the server will response with an error message (`{ error: message }`).

:::info Quick Responses and Queues

If you're doing anything lengthy, there's a chance it will fail. HTTP responses with an error are not a great user experience. And WebSocket doesn't have a solid error hanlding model.

In either case, you get a more responsive UI and better user experience by keeping request/response short and simple, and offloading everything else to a queue.
:::

For queued jobs, if the job times out, it returns to the queue and will be retried again.

Your application can make progress by breaking large pieces of work into smaller jobs, that will execute in parallel. Here too there's a benefit to setting a relatively short execution time (seconds or minutes).

The recommended practice for scheduled jobs is that the job itself shouldn't run for any extended period of time, since there's no retry mechanism.

If the job runs frequently enough (for example, polling from another service every 15 minutes), then if one job fails, the next job will pick up where it left.

If the job runs less frequently (for example, sending email reports once a day), you want to have a retry mechanism. The scheduled job should split the work into batches and queue these batches.

Because timeout typically means the task could run again, you want to watch [the abort signal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) and stop processing on timeout.

For example:

```ts
export default async function(job, { signal }) {
  await doSomething();
  if (signal.aborted) return;

  await doSomethingElse();
  if (signal.aborted) return;

  await doEvenMoreStuff();	
}
```

Some libraries, like [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) and AWS SDKs, accept an abort signal and will fail early if the signal is raised. For example:

```ts
export default async function(job, { signal }) {
  const response = await fetch(url, { signal });
  const data = await response.json();
  // do something with the data
}
```

:::info OnError

If the task times out, the `onError` middleware is called with a `TimeoutError` exception.
:::

