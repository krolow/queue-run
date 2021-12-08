import { List } from "antd";
import type { LoaderFunction } from "remix";
import { Link, useLoaderData } from "remix";
import dynamoDB from "../database";

type Project = {
  id: string;
};

export const loader: LoaderFunction = async () => {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT id FROM projects WHERE account_id = ?",
    Parameters: [{ S: "122210178198" }],
  });
  if (!items) return [];
  return items.map(({ id }) => ({ id: id.S })) as Project[];
};

export default function Index() {
  const projects = useLoaderData<Project[]>();

  return (
    <main className="space-y-4">
      <List header={<h2 className="text-xl">Your Projects</h2>}>
        {projects.map((project) => (
          <List.Item key={project.id}>
            <Link
              to={`/project/${project.id}`}
              prefetch="intent"
              className="text-xl"
            >
              {project.id}
            </Link>
          </List.Item>
        ))}
      </List>
    </main>
  );
}
