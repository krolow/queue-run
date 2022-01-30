# Authentication


## HTTP

Authenticate method called with the following:

- `bearerToken` — The token if the request includes `Authorization: Bearer <token>`
- `cookies` — Object with all cookies included in the request, eg `{ session: "1def…" }`
- `password` — The password if the request includes `Authorization: Basic <username_password>`
- `query` — Object with query string parameters, eg `{ api_token: "he7d…" }`
- `request` - The HTTP [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) object
- `requestId` - Unique request ID, used for tracing
- `username` — The username if the request includes `Authorization: Basic <username_password>`

The `authenticate` method loaded in the following order:

* From the module itself (HTTP or WebSocket request handler)
* Middleware exported from `_middleware.ts` in the current directory
* Middleware exported from `_middleware.ts` in the parent directory (recursive)

For example, you can apply authentication to all HTTP resources from `api/_middleware.ts`.

To disable authentication for a specific route, use `export const authenticate = null;`.

For example, to authenticate HTTP request used OAuth Bearer token:

```ts title=api/_middleware.ts
export async function authenticate({ bearerToken }) {
  if (!bearerToken)
    throw new Response("Expected bearer token", { status: 401 });
  try {
    const { sub, email } = await jwt.verify(bearerToken, process.env.JWT_SECRET);
    return { id: sub, email };
  } catch {
    throw new Response("Invalid/expired token", { status: 403 });
  }
}
```

A single `authenticate` method can use a combination of strategies:

```ts title=api/_middleware.ts
export async function authenticate(params) {
  const { bearerToken, cookies } = params;
  if (bearerToken)
    return await fromOAuthApp(bearerToken);
  if (cookies.session && cookies.session_sign)
    return await fromBrowser(cookies);
  const { api_key } = params.query;
  if (query.api_key)
    return await usingApiKey(request.api_key);
  throw new Response(null, { status: 401 });
}
```


## WebSocket

Without authentication you can only use WebSocket as request/response protocol, which you can already do with HTTP.

With authentication you can send messages to the user at any point in time, including when handling request from other users (eg collaborative editing), or from queued and scheduled job that execute in the background.

The message will be sent to every device the user is logged in from, so a way to deliver real time notification, and synchronize state between devices and the database.


### Authenticating First Message

This is the more common form of authentication. Once the browser established a WebSocket connection, the first message it sends is used for authentication.

If helps, but not necessary, to acknowledge successful notification, as in this example:

```ts title=web/client.ts
const ws = new WebSocket("wss://ws.grumpy-sunshine.queue.run");

// Connection opens, we immediately attempt to authenticate
ws.onopen = () => ws.send({ jwtToken });

// Wait for the server to either accept (message) or deny (close socket)
await new Promise((resolve, reject) => {
  ws.onmessage = resolve;
  ws.onclose = reject;
});
```

On the server, the `authenticate` middleware is called if it exists, and the connection is not associated with a user.

If if successfully authenticates the user, it should return an object with the user ID (`{ user: id }`). This user ID will be available to request handlers.

If anonymous access is allowed, it may return `null`. Request handlers will be called without a user ID.

Otherwise, the user is not authenticated, and the next WebSocket message will also go to the `authenticate` middleware. Recommended that in this case you call `socket.close`.


```ts title=socket/_middleware.ts
export async function authenticate({ data }) {
  // Typically the request would be a JSON object
  const { jwtToken } = data;
  try {
    const { sub, email } = await jwt.verify(bearerToken, process.env.JWT_SECRET);
    await socket.send('Accepted');
    return { id: sub, email };
  } catch {
    // Reject by closing the WebSocket
    await socket.close();
  }
}
```


### Authenticating HTTP Connection

Every WebSoekct connection starts with an HTTP request. You can use the `onConnect` middleware to authenticate or reject requests based on that HTTP request.

* The [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) API supported by most browsers does not allow sending HTTP headers
* The server has no access to the URL path or query string
* The server has no access to username:password from the URL
* The server has access to the `Origin` and `X-Forwarded-For` HTTP headers

The server has access to cookies sent by the browser, so you can use these to authenticate the user. To use cookies, the back-end and front-end must share a parent domain.

For example:

```ts title=socket/_middleware.ts
import { authenticated } from 'queue-run';

export async function onConnect({ cookies }) {
  const { session, sign } = cookies;
  const user = verify(session, sign);
  // At this stage we're dealing with HTTP request/response
  if (!user) throw new Response("Session expired", { status: 403 });
  // Have to call this explicitly
  await authenticated(user);
}
```

You can also use the `onConnect` method to reject clients based on IP address or origin, in combination with `authenticate` for authenticating and authorizing access.

You can use the `Authenticate` header with other clients, such as Node WebSocket libraries (eg [ws](https://github.com/websockets/ws)) or [websocat](https://github.com/vi/websocat).


## Using JWT Tokens

Authenticate JWT identity token based on the user's identity:

```ts title=api/_middleware.ts
import { jwt } from "queue-run";

// HTTP Authorization: Bearer <token>
export async function authenticate({ bearerToken }) {
  // We store the user ID as sub (subject)
  const { sub } = await jwt.verify({
    token: bearerToken,
    secret: process.env.JWT_SECRET
  });
  const user = await users.findOne({ id: sub });
  if (!user) throw new Response("No such user", { status: 403 });
  return user;
}
```

WebSocket authentication based on client sending token as the first message:

```ts title=socket/_middleware.ts
import { socket, jwt } from "queue-run";

// First message is JSON { token: <token> }
export async function authenticate({ data }) {
  try {
    const { sub } = await jwt.verify({
      token: data.token,
      secret: process.env.JWT_SECRET
    });
    const user = await users.findOne({ id: sub });
    if (!user) throw new Error("No such user");
    return user;
  } catch (error) {
    await socket.close();
  }
}
```

Using Google OAuth for single sign-on, we'll accept any user from our Google Workspace domain:

```ts title=api/_middleware.ts
import { jwt } from "queue-run";

export async function authenticate({ bearerToken }) {
  const profile = await jwt.google({
    token: bearerToken,
    clientId: process.env.GOOGLE_CLIENT_ID,
    domain: process.env.GOOGLE_DOMAIN
  });
  return { id: profile.sub };
}
```