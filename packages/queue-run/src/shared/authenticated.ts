import { getLocalStorage } from "..";
import { AuthenticatedUser } from "../http/exports";

export default async function authenticated(user: AuthenticatedUser | null) {
  getLocalStorage().authenticated(user);
}
