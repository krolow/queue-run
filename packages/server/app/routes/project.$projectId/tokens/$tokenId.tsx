import { ActionFunction, LoaderFunction, redirect } from "remix";
import invariant from "tiny-invariant";
import dynamoDB from "~/database";

export const action: ActionFunction = async ({ params, request }) => {
  const { projectId, tokenId } = params;
  invariant(projectId && tokenId);

  switch (request.method) {
    case "DELETE": {
      await dynamoDB.executeStatement({
        Statement: "DELETE FROM client_tokens WHERE id = ? AND project_id = ?",
        Parameters: [{ S: tokenId }, { S: projectId }],
      });
      return {};
    }

    case "PUT": {
      const name = (await request.formData()).get("name")?.toString();
      invariant(name, "Token name is required");
      await dynamoDB.executeStatement({
        Statement:
          "UPDATE client_tokens SET name = ? WHERE id = ? AND project_id = ?",
        Parameters: [{ S: name }, { S: tokenId }, { S: projectId }],
      });
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
