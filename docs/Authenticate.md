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

The `authenticate` method is a bit more complicated here, as it needs to support two scenarios:

* Authenticating users based on cookies, or rejecting clients based on origin/IP
* Authenticating users based on the first message (JWT token, API key, etc)

### Authenticating With Cookies

Every WebSocket connection starts with an HTTP request. The server has access to that request, with some limitations:

* The [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) API supported by most browser does not allow sending HTTP headers
* The server has access to cookies sent by the browser
* The server has no access to the URL path or query string
* The server has no access to username:password from the URL
* The server has access to the `Origin` and `X-Forwarded-For` HTTP headers

At this stage, you can authenticate the user based on browser or cookies, or you can reject clients based on their origin/IP.

```ts title=socket/_middleware.ts
export async function authenticate({ cookies }) {
  const { session, sign } = cookies;
  const id = verify(session, sign);
  if (!id) throw new Response("Session expired", { status: 403 });
  return { id };
}
```

### Authenticating With Message

If you don't want to use browser cookies, you can have the client send an authentication message. This message can contain a session token, JWT identity token, API key, etc.

This browser code would send an authentication request as soon as it opens a WebSocket connection to the server:

```ts title=web/client.ts
const ws = new WebSocket("wss://ws.grumpy-sunshine.queue.run");
// Connection opens, we immediately send user's token
ws.onopen = () => ws.send({ jwtToken });
// Wait for OK from server
await new Promise((resolve) => ws.onmessage = resolve);
```

On the server, we're going to ignore the first call to `authenticate` (HTTP request), and act on the second call (WebSocket message). We can:

* If successfully authenticated, return an object representing the user
* If we allow unauthenticated access, return `null`
* Otherwise, reject this connection with `socket.close`

```ts title=socket/_middleware.ts
export async function authenticate({ message }) {
  // Called first with request + cookies, ignore
  if (!message) return;

  // Called next with message
  const { jwtToken } = message;
  try {
    const { sub, email } = await jwt.verify(bearerToken, process.env.JWT_SECRET);
    socket.send('Accepted');
    return { id: sub, email };
  } catch {
    // Not an HTTP request, close socket instead
    socket.close();
  }
}
```
