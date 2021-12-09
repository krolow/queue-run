import { List, Tag } from "antd";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { Link, LoaderFunction, useLoaderData, useMatches } from "remix";
import invariant from "tiny-invariant";
import { dynamoDB } from "../../aws";
import { Queues } from "./branch/$branchId/queues";

type Project = {
  id: string;
  defaultBranch?: string;
};

type Deploy = {
  branch?: string;
  createdAt: string;
  id: string;
  status: string;
};

export const loader: LoaderFunction = async ({ params }) => {
  const { projectId } = params;
  invariant(projectId);
  return {
    project: await getProject(projectId),
    deploys: await getDeploys(projectId),
  };
};

async function getProject(projectId: string): Promise<Project> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM projects WHERE account_id = ? AND id = ?",
    Parameters: [{ S: "122210178198" }, { S: projectId }],
  });
  const project = items?.[0];
  if (!project) throw new Response(null, { status: 404 });
  return {
    id: project.id.S!,
    defaultBranch: project.default_branch?.S,
  };
}

async function getDeploys(projectId: string): Promise<Deploy[]> {
  const { Items: items } = await dynamoDB.executeStatement({
    Statement: "SELECT * FROM deploys WHERE project_id = ?",
    Parameters: [{ S: projectId }],
  });
  if (!items) return [];
  return items.map(({ branch, created_at, id, status }) => ({
    branch: branch.S!,
    createdAt: new Date(+created_at.N!).toISOString(),
    id: id.S!,
    status: status.S!,
  }));
}

export default function Index() {
  const { projectId } = useMatches()[1].params;
  invariant(projectId);

  const { project, deploys } =
    useLoaderData<{ deploys: Deploy[]; project: Project }>();

  return (
    <main className="space-y-4">
      {project.defaultBranch && (
        <Queues
          projectId={projectId}
          branchId={project.defaultBranch ?? "main"}
        />
      )}
      <List
        header={<h2 className="text-lg">Recent Deployments</h2>}
        dataSource={deploys}
        renderItem={({ branch, createdAt, id, status }) => (
          <List.Item
            extra={[
              <Tag key="tag" color="red">
                {status}
              </Tag>,
              <span key="time">
                {formatDistanceToNowStrict(parseISO(createdAt))} ago
              </span>,
            ]}
          >
            <Link
              to={`/projects/${project.id}/deploys/${id}`}
              className="text-base"
            >
              {project.id}
              {branch === project.defaultBranch ? null : `-${branch}`}
              .queue.run
            </Link>
          </List.Item>
        )}
      />
    </main>
  );
}
