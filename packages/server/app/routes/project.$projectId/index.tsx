import { List, Tag } from "antd";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { Link, LoaderFunction, useLoaderData, useMatches } from "remix";
import invariant from "tiny-invariant";
import { getDeploys, getProject, Project } from "../../database";

type Deploy = {
  branch?: string;
  createdAt: string;
  id: string;
  status: string;
};

export const loader: LoaderFunction = async ({ params }) => {
  const { projectId } = params;
  invariant(projectId);
  const project = await getProject({ id: projectId });
  const deploys = await getDeploys({ projectId });
  return { project, deploys };
};

export default function Index() {
  const { projectId } = useMatches()[1].params;
  invariant(projectId);

  const { project, deploys } =
    useLoaderData<{ deploys: Deploy[]; project: Project }>();

  return (
    <main className="space-y-4">
      <List header={<h2 className="text-lg">Recent Deployments</h2>}>
        {deploys.map((deploy) => (
          <List.Item
            key={deploy.id}
            extra={[
              <Tag color="red">{deploy.status}</Tag>,
              <span>
                {formatDistanceToNowStrict(parseISO(deploy.createdAt))} ago
              </span>,
            ]}
          >
            <Link
              to={`/projects/${project.id}/deploys/${deploy.id}`}
              className="text-lg"
            >
              {project.id}
              {deploy.branch === project.defaultBranch
                ? null
                : `.${deploy.branch}`}
              .queue.run
            </Link>
          </List.Item>
        ))}
      </List>
    </main>
  );
}
