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
  return json(project);
};

export default function Index() {
  const project = useLoaderData<Project>();

  return (
    <main className="space-y-4 my-4">
      <h1 className="font-bold text-lg">{project.id}</h1>
      <ul className="max-w-xs"></ul>
    </main>
  );
}
