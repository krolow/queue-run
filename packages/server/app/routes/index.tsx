import { List } from "antd";
import type { LoaderFunction } from "remix";
import { Link, useLoaderData } from "remix";
import { getProjects, Project } from "../database";

export const loader: LoaderFunction = async () => {
  return await getProjects();
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
