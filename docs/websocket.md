# WebSocket

WebSockets keep an open connection between the browser and the server.

They allow you to do many interesting things:

* Low latency communication, eg sending changes to the server to save as you type
* Update multiple users at once in real time, eg chat rooms and collaborative editing
* Update multiple devices at once for the same user, eg sync desktop and mobile
* Update the user when a long running task completes, eg a queued job
* Track which users are currently online, aka "presence"

WebSocket make that possible by allowing you to send a message to the client at any time, during an HTTP/WebSocket request, or from a queued or scheduled job.

You can send messages to specific users, for example, all members of a chat room, or all users actively editing a document. Read [more about authentication](authenticate.md).


## Request Handlers

The simplest way to handle WebSocket requests it to create a file `socket/index.ts` and export the WebSocket request handler.

For example:

```ts title=socket/index.md
import { socket } from "queue-run";

export default async function({ data }) {
  console.info("Message from client: %o", data);
  await socket.send({ reply: "👋 Welcome!" });
}
```

The request handler receives a single argument with the properties:

- `connection` — The connection ID for this WebSocket
- `data` — The request is either a JavaScript object (JSON), string, or `Buffer`
- `requestId` - Unique request ID
- `user` — User object returned from the [authenticate](authenticate.md) middleware

Since JSON is the most common use case, this is also the default. If you want to receive the raw text string, use `export const config = { type: "string" };`. To receive the raw `Buffer`, set `type: "binary"`;

Clients can still connect and you can send them messages.

If the request handler throws any error, or the request times out, the server sends back a JSON object of the form `{ error: string }`.

You can change the timeout using `export const config = { timeout: inSeconds };`.


## Sending Messages

You can use `socket.send(message)` to send a message.

The sent message can be any of:

- `any object` — Respond with a JSON document
- `Buffer` — Respond with binary content
- `string` — Respond with string

If the user is authenticated, it will send a message to that user, on all devices that have an open WebSocket connection.

This works in HTTP and WebSocket request handlers, as well as queued jobs.

You can also send a message to specific user, or up to 100 users, using `socket.to(userIDs).send(message)`. This works everywhere, including scheduled jobs.

```ts title=queues/chat_message.ts
export default async function({ roomId, message }) {
  ...
  const room = await db.rooms.findOne({ id: roomId });
  if (!room) return;
  await socket
    .to(room.members)
    .send({ event: 'message', message });
} 
```

If the user is not authenticated, you can still send them a message from within the WebSocket request handler using `socket.send`. It will only arrive on the currently connected device.

The `socket.send` method is generic, so you can apply type checking for messages:

```ts
await socket.send<{ update: 'profile '}>({ update: 'profile', profile });
```

:::tip Await and Errors

It's a good practice to use `await` to make sure your code waits for the message to be sent.

If you don't care for errors, you can do this:

```ts
await socket.push(message).catch(() => undefined);
```
:::


## Presence

If you want to track whether a user is online (has an active WebSocket connection):

* `onOnline(userId)` will be called when the user first connects, after they've been authenticated
* `onOffline(userId)` will be called when the last connection has closed
* `socket.isOnline(userID)` will return `true` if there's an open connection for that user

You can export `onOnline` and `onOffline` from `socket/index.ts` or `socket/_middleware.ts`.

You can combine that with WebSocket messages from the client to determine whether the user is active in a chat room, editing a document, etc.

For example:

```ts socket/[room]/action_enter.ts
export default async function({ data, user }) {
  await db.join({ roomId: data.room, userId: user.id });
}
```

```ts socket/_middleware.ts
export async function onOffline(userId) {
  await db.leaveAllRooms({ userId });
}
```

:::note Authentication

Presence relies on [authentication](authenticate.md) and having a persisent user ID.
:::
