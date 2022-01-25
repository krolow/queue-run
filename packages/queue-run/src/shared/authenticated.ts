import { getLocalStorage } from "..";

export async function authenticated(user: AuthenticatedUser | null) {
  getLocalStorage().authenticated(user);
}

/**
 * Authenticated user returned from the authenticate middleware.
 *
 * The `id` property is required.
 */
export type AuthenticatedUser = { id: string; [key: string]: unknown };
