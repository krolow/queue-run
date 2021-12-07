import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, asFetch, redirect, Request, Response } from "./fetch";

const dynamoDB = new DynamoDB({});

export const handler = (event: APIGatewayEvent) =>
  asFetch(event, async (request) => {
    switch (request.method) {
      case "GET": {
        return redirect(getDashboardURL(request));
      }
      case "POST": {
        const authorization = request.headers.get("authorization");
        if (!authorization)
          throw new Response("Missing authorization header", { status: 401 });
        const token = authorization.match(/^Bearer (.+)$/)?.[1];
        if (!token)
          throw new Response("Missing authorization bearer token", {
            status: 401,
          });
        const { Item } = await dynamoDB.getItem({
          TableName: "client_tokens",
          Key: { token: { S: token } },
        });
        if (!Item)
          throw new Response("Invalid authorization bearer token", {
            status: 403,
          });
        const { project, branch } = getProjectAndBranch(
          request.headers.get("host")
        );
        if (Item.project.S !== project)
          throw new Response(null, {
            status: 404,
          });
        return new Response(null, { status: 204 });
      }
      case "HEAD":
        return new Response(null, { status: 204 });
      default:
        throw new Response("", { status: 405 });
    }
  });

function getDashboardURL(request: Request): string {
  const { project, branch } = getProjectAndBranch(request.headers.get("host"));
  const path = branch
    ? `project/${project}/branch/${branch}`
    : `project/${project}`;
  return `https://queue.run/${path}`;
}

function getProjectAndBranch(host?: string): {
  project: string;
  branch?: string;
} {
  const subdomain = host?.split(".")[0];
  const [_, project, branch] =
    subdomain?.match(/^([a-z]+-[a-z]+)(-.+)?$/) ?? [];
  if (!project) throw new Response(null, { status: 404 });
  return { project, branch: branch?.substr(1) };
}
