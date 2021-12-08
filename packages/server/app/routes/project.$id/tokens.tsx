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
  useTransition,
} from "remix";
import invariant from "tiny-invariant";
import {
  ClientToken,
  createClientToken,
  getProject,
  listClientTokens,
  Project,
} from "../../database";

export const loader: LoaderFunction = async ({ params }) => {
  invariant(params.id, "Project id is required");
  const project = await getProject({ id: params.id });
  const clientTokens = await listClientTokens({ projectId: project.id });
  return { project, clientTokens };
};

export const meta: MetaFunction = ({ params }) => {
  return {
    title: `${params.id} deployments`,
  };
};

export const action: ActionFunction = async ({ params, request }) => {
  if (request.method !== "POST") return json("", 405);

  const projectId = params.id;
  invariant(projectId, "Project id is required");
  const data = await request.formData();
  const name = data.get("name")?.toString() ?? "untitled";
  return await createClientToken({ name, projectId });
};

export default function Index() {
  const { project, clientTokens } =
    useLoaderData<{ clientTokens: ClientToken[]; project: Project }>();
  const transition = useTransition();
  const actionData = useActionData<ClientToken & { bearerToken: string }>();
  const fetcher = useFetcher();

  return (
    <main className="space-y-4 my-4">
      <h1 className="space-x-2 text-3xl">
        <span className="font-bold">{project.id}</span>
        <span className="font-light">access tokens</span>
      </h1>
      <ul>
        {clientTokens.map(({ id, name, lastAccessAt }) => (
          <li key={id} className="flex justify-between">
            <EditableTokenName {...{ id, name }} />
            <span>
              {lastAccessAt
                ? `Last used ${lastAccessAt.toLocaleString()}`
                : null}
            </span>
            <span>
              <button
                onClick={() =>
                  fetcher.submit(null, {
                    method: "delete",
                    action: `/token/${id}`,
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

function EditableTokenName({ id, name }: { id: string; name: string }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const fetcher = useFetcher();

  if (isEditing)
    return (
      <form
        onSubmit={(event) => {
          const item = event.currentTarget.elements.namedItem(
            "name"
          ) as HTMLInputElement;
          fetcher.submit(
            { name: item.value },
            { method: "put", action: `/token/${id}` }
          );
          setIsEditing(false);
        }}
      >
        <input defaultValue={name || id} type="text" name="name" />
      </form>
    );
  else {
    return <span onClick={() => setIsEditing(true)}>{name || id}</span>;
  }
}
