import type { LoaderFunction } from "remix";
import { json, Link, useLoaderData } from "remix";
import dynamoDB from "~/../lib/dynamodb";

type Project = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
};

// Loaders provide data to components and are only ever called on the server, so
// you can connect to a database or run any server side code you want right next
// to the component that renders it.
// https://remix.run/api/conventions#loader
export const loader: LoaderFunction = async () => {
  const projects = (
    await dynamoDB.executeStatement({
      Statement: `SELECT * FROM projects WHERE account_id = ?`,
      Parameters: [{ S: "122210178198" }],
    })
  ).Items?.map(
    (Item) =>
      ({
        id: Item.id.S,
        createdAt: new Date(+Item.created_at.N!),
        updatedAt: new Date(+Item.updated_at.N!),
      } as Project)
  );

  return json(projects);
};

// https://remix.run/guides/routing#index-routes
export default function Index() {
  const projects = useLoaderData<Project[]>();

  return (
    <main className="space-y-4 my-4">
      <h1 className="font-bold text-lg">Your Projects</h1>
      <ul className="max-w-xs">
        {projects.map((project) => (
          <li
            key={project.id}
            className="border border-gray-300 rounded-md p-4 truncate"
          >
            <Link to={`/projects/${project.id}`} prefetch="intent">
              {project.id}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
