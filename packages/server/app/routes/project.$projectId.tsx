import { Menu } from "antd";
import { Link, Outlet, useMatches } from "remix";
import invariant from "tiny-invariant";

export default function ProjectPageLayout() {
  const match = useMatches().slice(-1)[0];
  const { projectId } = match.params;
  invariant(projectId);

  const pages = [
    { label: "Overview", path: `/project/${projectId}/` },
    { label: "Access Tokens", path: `/project/${projectId}/tokens` },
  ];

  return (
    <main className="space-y-4 my-4">
      <h1 className="space-x-2 text-3xl font-bold">
        {projectId}
        <Menu mode="horizontal" selectedKeys={[match.pathname]}>
          {pages.map(({ label, path }) => (
            <Menu.Item key={path}>
              <Link to={path}>{label}</Link>
            </Menu.Item>
          ))}
        </Menu>
      </h1>
      <Outlet />
    </main>
  );
}
