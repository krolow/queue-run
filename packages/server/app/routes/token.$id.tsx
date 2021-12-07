import { ActionFunction, LoaderFunction, redirect } from "remix";
import invariant from "tiny-invariant";
import { deleteClientToken } from "~/database";

export const action: ActionFunction = async ({ params, request }) => {
  if (request.method !== "DELETE") throw new Response(null, { status: 405 });
  const { tokenId } = params;
  invariant(tokenId, "Token id is required");
  await deleteClientToken({ tokenId });
};

export const loader: LoaderFunction = async () => redirect("/");

export default function DeleteToken() {
  return null;
}
