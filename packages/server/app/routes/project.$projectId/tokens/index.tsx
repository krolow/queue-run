import React from "react";
import {
  ActionFunction,
  Form,
  json,
  LoaderFunction,
  MetaFunction,
  useActionData,
  useFetcher,
  useLoaderData,
  useMatches,
  useTransition,
} from "remix";
import invariant from "tiny-invariant";
import createBearerToken from "../../../createBearerToken";
import dynamoDB from "../../../database";

type ClientToken = {
  id: string;
  name: string;
  lastAccessedAt?: Date;
};

export const loader: LoaderFunction = async ({ params }) => {
  const { projectId } = params;
  invariant(projectId);

  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM client_tokens WHERE project_id = ?",
    Parameters: [{ S: projectId }],
  });
  if (!items) return [];
  return items.map((item) => ({
    id: item.id.S,
    name: item.name?.S ?? item.id.S,
    lastAccessedAt:
      item.last_accessed_at?.N && new Date(+item.last_accessed_at.N),
  }));
};

export const meta: MetaFunction = ({ params }) => {
  return {
    title: `${params.id} deployments`,
  };
};

export const action: ActionFunction = async ({ params, request }) => {
  if (request.method !== "POST") return json("", 405);

  const { projectId } = params;
  invariant(projectId);

  const { tokenId, bearerToken } = createBearerToken();

  await dynamoDB.executeStatement({
    Statement:
      "INSERT INTO client_tokens VALUE { 'id': ?, 'project_id': ?, 'created_at': ? }",
    Parameters: [
      { S: tokenId },
      { S: projectId },
      { N: Date.now().toString() },
    ],
  });
  return { bearerToken };
};

export default function Index() {
  const { projectId } = useMatches()[1].params;
  invariant(projectId);

  const clientTokens = useLoaderData<ClientToken[]>();
  const transition = useTransition();
  const actionData = useActionData<{ bearerToken: string }>();
  const fetcher = useFetcher();

  return (
    <main className="space-y-4 my-4">
      <h1 className="space-x-2 text-3xl">
        <span className="font-bold">{projectId}</span>
        <span className="font-light">access tokens</span>
      </h1>
      <ul>
        {clientTokens.map(({ id, name, lastAccessedAt }) => (
          <li key={id} className="flex justify-between">
            <EditableTokenName {...{ id, name, projectId }} />
            <span>
              {lastAccessedAt
                ? `Last use ${lastAccessedAt.toLocaleString()}`
                : null}
            </span>
            <span>
              <button
                onClick={() =>
                  fetcher.submit(null, {
                    method: "delete",
                    action: `/project/${projectId}/tokens/${id}`,
                    replace: false,
                  })
                }
              >
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      <Form method="post">
        <input type="text" name="name" />
        <button type="submit" disabled={!!transition.submission}>
          {transition.submission
            ? "Creating access token …"
            : "Create New Access Token"}
        </button>
      </Form>
      {actionData && (
        <section className="border border-gray-100 rounded-md p-4">
          <p>
            This is your new access token. Write it down and keep it safe. You
            will not have access to this token after you reload the page.
          </p>
          <pre className="my-4 bg-border-100">
            <code>{actionData.bearerToken}</code>
          </pre>
        </section>
      )}
    </main>
  );
}

function EditableTokenName({
  id,
  name,
  projectId,
}: {
  id: string;
  name: string;
  projectId: string;
}) {
  const [isEditing, setIsEditing] = React.useState(false);
  const fetcher = useFetcher();

  return (
    <fetcher.Form
      method="put"
      action={`/project/${projectId}/tokens/${id}`}
      onSubmit={() => setIsEditing(false)}
    >
      {isEditing ? (
        <>
          <input defaultValue={name} type="text" name="name" />
          <button type="submit">Save</button>
          <button type="reset" onClick={() => setIsEditing(false)}>
            Cancel
          </button>
        </>
      ) : (
        <span onClick={() => setIsEditing(true)}>{name}</span>
      )}
    </fetcher.Form>
  );
}
