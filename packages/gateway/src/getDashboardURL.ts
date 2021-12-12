import { Request, Response } from "node-fetch";
import { URL } from "url";

export default function getDashboardURL(request: Request): string {
  const { project, branch } = getProjectAndBranch(request.headers.get("host"));
  const url = new URL("https://queue.run");
  url.pathname = branch
    ? `project/${project}/branch/${branch}`
    : `project/${project}`;
  return url.href;
}

function getProjectAndBranch(host: string | null): {
  project: string;
  branch?: string;
} {
  const subdomain = host?.split(".")[0];
  const [_, project, branch] =
    subdomain?.match(/^([a-z]+-[a-z]+)(-.+)?$/) ?? [];
  if (!project) throw new Response("", { status: 404 });
  return { project, branch: branch?.substr(1) };
}
