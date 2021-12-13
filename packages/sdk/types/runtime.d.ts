// Successful authentication returns an object with the user ID.
//
// The user ID can be anything.
//
// You can also include additional user properties. These properties are passed
// on to the HTTP request handler (but not to queues).
type AuthenticatedUser = { id: string; [key: string]: unknown };
type Maybe<T> = T | null | undefined;

// Authenticate method.
//
// Export this method from your function or _middleware to authenticate that route.
//
// Successful authentication should return `user.id`.
//
// If you return anything else, the server will respond with 403.
//
// If you want specific messsage, status, or headers, you can throw a Response.
export declare type AuthenticateMethod = (
  request: Request
) => Maybe<AuthenticatedUser> | Promise<Maybe<AuthenticatedUser>>;
