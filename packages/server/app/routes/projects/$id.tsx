import type { LoaderFunction } from "remix";
import { json, useLoaderData } from "remix";
import dynamoDB from "~/../lib/dynamodb";

type Deploy = {
  branch: string;
  createdAt: Date;
  id: string;
  status: string;
  updatedAt: Date;
};

type Project = {
  createdAt: Date;
  deploys: Array<Deploy>;
  id: string;
  updatedAt: Date;
};

export const loader: LoaderFunction = async ({ params }) => {
  const { id: projectId } = params as { id: string };

  console.log(projectId);

  const projects = (
    await dynamoDB.executeStatement({
      Statement: `SELECT * FROM projects WHERE id = ? AND account_id = ?`,
      Parameters: [{ S: projectId }, { S: "122210178198" }],
    })
  ).Items?.map(
    (Item) =>
      ({
        id: Item.id.S,
        createdAt: new Date(+Item.created_at.N!),
        updatedAt: new Date(+Item.updated_at.N!),
      } as Project)
  );
  const project = projects?.[0];
  if (!project) throw new Response("Not found", { status: 404 });

  const deploys = (
    await dynamoDB.executeStatement({
      Statement: `SELECT * FROM deploys WHERE project_id = ?`,
      Parameters: [{ S: projectId }],
    })
  ).Items?.map(
    (Item) =>
      ({
        branch: Item.branch.S,
        createdAt: new Date(+Item.created_at.N!),
        id: Item.id.S,
        status: Item.status.S,
        updatedAt: new Date(+Item.updated_at.N!),
      } as Deploy)
  );

  return json({ ...project, deploys });
};

export default function Index() {
  const project = useLoaderData<Project>();

  return (
    <main className="space-y-4 my-4">
      <h1 className="space-x-2 text-3xl">
        <span className="font-bold">{project.id}</span>
        <span className="font-light">deployments</span>
      </h1>
      <table className="w-full border-collapse border-gray-200 border rounded-md">
        <tbody>
          {project.deploys.map((deploy) => (
            <tr key={deploy.id}>
              <td className="w-1/2 p-2 truncate">
                <a href={`/projects/${project.id}/deploys/${deploy.id}`}>
                  {project.id}-{deploy.branch}
                </a>
              </td>
              <td className="w-1/4 p-2 truncate">{deploy.status}</td>
              <td className="w-1/4 p-2 truncate">
                {deploy.updatedAt.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
