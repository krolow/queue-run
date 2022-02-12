import { getExecutionContext } from "..";

/**
 * Call this to autheticate a user.
 *
 * The `authenticate` method should return a user object (authenticated) or null
 * (anonymous). Alternatively, but you don't have to, you can call this method.
 *
 * This method is useful for authenticating WebSocket connections during the
 * `onConnect` stage.
 *
 * @param user
 */
export async function authenticated(user: AuthenticatedUser | null) {
  getExecutionContext().authenticated(user);
}

/**
 * Authenticated user returned from the authenticate middleware.
 *
 * The `id` property is required.
 */
export type AuthenticatedUser = { id: string; [key: string]: unknown };
