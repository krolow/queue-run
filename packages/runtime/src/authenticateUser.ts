import { AuthenticatedUser, AuthenticateMethod } from "../types/middleware";

export default async function authenticateUser(
  request: Request,
  fn: AuthenticateMethod
): Promise<AuthenticatedUser> {
  let user;

  try {
    user = await fn(request);
  } catch (error) {
    console.error("Error in authenticate method", error);
    throw new Response("Unauthorized", { status: 403 });
  }

  if (user?.id) return user;

  if (user) {
    console.error("Authenticate method returned user object without id", user);
    throw new Response("Unauthorized", { status: 403 });
  } else throw new Response("Unauthorized", { status: 403 });
}
