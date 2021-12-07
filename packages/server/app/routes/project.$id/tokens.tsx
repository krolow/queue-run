import {
  ActionFunction,
  Form,
  json,
  LoaderFunction,
  MetaFunction,
  useActionData,
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

  const actionData = useActionData();
  console.log("userActionData", clientTokens, actionData);

  return (
    <main className="space-y-4 my-4">
      <h1 className="space-x-2 text-3xl">
        <span className="font-bold">{project.id}</span>
        <span className="font-light">access tokens</span>
      </h1>
      <table className="w-full border-collapse border-gray-200 border rounded-md">
        <tbody>
          {clientTokens.map((clientToken) => (
            <tr key={clientToken.id}>
              <td className="w-1/2 p-2 truncate">
                {clientToken.createdAt.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Form method="post">
        <input type="text" name="name" />
        <button type="submit" disabled={!!transition.submission}>
          {transition.submission
            ? "Creating access token …"
            : "Create New Access Token"}
        </button>
      </Form>
    </main>
  );
}
