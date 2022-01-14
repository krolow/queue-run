# WebSocket

**TBD**

## Request Handlers

Request handlers accept a WebSocket request.

They take a single argument with named parameters:

- `connection` — The connection ID for this WebSocket
- `data` — The request is either a JavaScript object (JSON), string, or `Buffer`
- `requestId` - Unique request ID
- `user` — User object returned from the [authenticate](Authenticate.md) middleware

WebSocket request handler can a respond with a message, but this is not required. It can also use `socket.send` to send one or more messages.

The sent message can be any of:

- `any object` — Respond with a JSON document
- `Buffer` — Respond with binary content
- `string` — Respond with string

If the request handler throws any other error, or the request times out, the server sends back a JSON object of the form `{ error: string }`. That error is also logged by the [Logging Middleware](#logging-middleware).


## Sending Messages

You use the `socket` object to send a message to one or more users:

* With a list of users, to all these users (who have an active WebSocket connection)
* Without a list, to the user associated with the current HTTP/WebSocket request or queued job
* Otherwise, over the current connection (WebSocket request handler only)

In this example, when the user updates their profile, we save the changes in the database, and then notify all the user's devices:

```ts title=api/profile.ts
import { socket } from 'queue-run';

export async function put({ body, params }) {
  await db.users.update({ id: params.id, ...body });
  await socket.send({ event: 'profile' });
}
```

You can also update a specific user or set of users:

```ts title=queues/chat.ts
export default async function({ roomId, message }) {
  ...
  const room = await db.rooms.findOne({ id: roomId });
  if (!room) return;
  await socket
    .to(room.members)
    .send({ event: 'message', message });
} 
```


## Logging Middleware

WebSocket support the following logging middleware:

- `onMessageReceived(request)` — Called on every request
- `onMessageSent(message)` — Called for every message sent
- `onError(error, request)` — Called if the request handler or any middleware throws an error

The default middleware logs messages received and errors, but not messages sent.

You can change the middleware for any given route by exporting the functions you want to add, just like you export request handlers.

The most specific middleware is picked in this order:

- Middleware exported by the request handler file itself
- Middleware exported by `_middleware.ts` in the current directory
- The default middleware

If you don't want to use the default middleware, or disable middleware for one route, you can export `null`.

Your middleware can also wrap the default middleware.

For example:

```ts title=socket/_middleware.ts
export async function onMessageReceived({ connection, data }) {
  console.log('%s: <= %s', connection, data);
}

export async function onMessageSent({ connection, data }) {
  console.log('%s: => %s', connection, data);
}
```

:::note Middleware Context

* `onAuthenticate` is called once for every new connection before accepting the connection
* `onAuthenticate` is loaded from either `socket/index.ts` or `socket/_middleware.ts`
* `onMessageReceived` is called for every message received, loaded from the specific request, or from `socket/_middleware.ts`
* If the request handler responds, `onMessageSent` associated with that request handler is called
* For every other message sent, `onMessageSent` is called, loaded from either `socket/index.ts` or `socket/_middleware.ts`
:::