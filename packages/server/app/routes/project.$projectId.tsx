import { Menu } from "antd";
import { Link, MetaFunction, Outlet, useMatches } from "remix";
import invariant from "tiny-invariant";

export const meta: MetaFunction = ({ params }) => {
  return { title: params.projectId! };
};

export default function ProjectPageLayout() {
  const match = useMatches().slice(-1)[0];
  const { projectId } = match.params;
  invariant(projectId);

  const pages = [
    { label: "Overview", path: `/project/${projectId}/` },
    { label: "Main branch", path: `/project/${projectId}/branch/main` },
    { label: "Access Tokens", path: `/project/${projectId}/tokens` },
  ];

  return (
    <main>
      <h1 className="text-2xl space-x-2">
        <span className="font-regular">Project</span>
        <span className="font-bold">{projectId}</span>
      </h1>
      <Menu mode="horizontal" selectedKeys={[match.pathname]}>
        {pages.map(({ label, path }) => (
          <Menu.Item key={path}>
            <Link to={path}>{label}</Link>
          </Menu.Item>
        ))}
      </Menu>
      <div className="my-10">
        <Outlet />
      </div>
    </main>
  );
}
