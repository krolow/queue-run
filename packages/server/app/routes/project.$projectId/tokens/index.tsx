import { faCheck, faTimes, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import React, { useEffect } from "react";
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
    name: item.name?.S ?? new Date(+item.created_at.N!).toISOString(),
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

  return (
    <main className="space-y-4 my-4">
      <h1 className="space-x-2 text-3xl">
        <span className="font-bold">{projectId}</span>
        <span className="font-light">access tokens</span>
      </h1>
      <table className="border-collapse w-full">
        <tbody>
          {clientTokens.map(({ id, name, lastAccessedAt }) => (
            <tr key={id}>
              <ClientToken {...{ id, name, lastAccessedAt, projectId }} />
            </tr>
          ))}
        </tbody>
      </table>
      <Form method="post">
        <button
          type="submit"
          disabled={!!transition.submission}
          className="p-2 bg-blue-300 rounded-sm"
        >
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

function ClientToken({
  id,
  lastAccessedAt,
  name,
  projectId,
}: {
  id: string;
  lastAccessedAt?: Date;
  name: string;
  projectId: string;
}) {
  const fetcher = useFetcher();

  return (
    <tr className="flex justify-between flex-nowrap">
      <td className="w-full py-1">
        <EditableTokenName {...{ id, name, projectId }} />
      </td>
      <td className="truncate p-1">
        {lastAccessedAt ? `Last use ${lastAccessedAt.toLocaleString()}` : null}
      </td>
      <td className="py-1">
        <button
          className="p-1 w-10 bg-blue-300 rounded-sm"
          onClick={() =>
            fetcher.submit(null, {
              method: "delete",
              action: `/project/${projectId}/tokens/${id}`,
            })
          }
        >
          <FontAwesomeIcon icon={faTrash} spin={!!fetcher.submission} />
        </button>
      </td>
    </tr>
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
  useEffect(
    function () {
      if (!fetcher.submission) setIsEditing(false);
    },
    [fetcher.submission]
  );

  return (
    <fetcher.Form
      method="put"
      action={`/project/${projectId}/tokens/${id}`}
      className="h-10 leading-10 align-middle"
    >
      {isEditing ? (
        <span className="flex flex-nowrap gap-2">
          <input
            defaultValue={name}
            type="text"
            name="name"
            className="w-full"
          />
          <button
            type="submit"
            className="p-1 w-10 bg-blue-300 rounded-sm"
            title="Change name"
          >
            <FontAwesomeIcon
              icon={faCheck}
              size="lg"
              spin={!!fetcher.submission}
            />
          </button>
          <button
            type="reset"
            className="p-1 w-10 bg-blue-300 rounded-sm"
            onClick={() => setIsEditing(false)}
            title="Cancel"
          >
            <FontAwesomeIcon icon={faTimes} size="lg" />
          </button>
        </span>
      ) : (
        <span
          className="inline-block w-full cursor-pointer"
          title="Click to change name"
          onClick={() => {
            setIsEditing(true);
            return false;
          }}
        >
          {name}
        </span>
      )}
    </fetcher.Form>
  );
}
