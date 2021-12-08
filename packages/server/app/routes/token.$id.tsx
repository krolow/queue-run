import { ActionFunction, LoaderFunction, redirect } from "remix";
import invariant from "tiny-invariant";
import { deleteClientToken, renameClientToken } from "~/database";

export const action: ActionFunction = async ({ params, request }) => {
  const tokenId = params.id;
  invariant(tokenId, "Token id is required");
  switch (request.method) {
    case "DELETE": {
      await deleteClientToken({ tokenId });
      return {};
    }

    case "PUT": {
      const name = (await request.formData()).get("name");
      console.log("rename", tokenId, name);
      await renameClientToken({ tokenId, name });
      return {};
    }

    default:
      throw new Response(null, { status: 405 });
  }
};

export const loader: LoaderFunction = async () => redirect("/");

export default function DeleteToken() {
  return null;
}
