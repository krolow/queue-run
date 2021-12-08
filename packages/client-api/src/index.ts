import { Response } from "node-fetch";
import { URL } from "url";
import { asFetchRequest } from "./asFetch";
import authenticate from "./authenticate";
import getDashboardURL from "./getDashboardURL";
import pushMessage from "./pushMessage";

export const handler = asFetchRequest(async (request) => {
  switch (request.method) {
    case "GET": {
      const url = getDashboardURL(request);
      return new Response(`See ${url}`, {
        status: 302,
        headers: { Location: url },
      });
    }

    case "POST": {
      const { projectId, branch } = await authenticate(request);
      const { pathname } = new URL(request.url);
      const [, action] = pathname.split("/");
      if (action === "queue")
        return await pushMessage({ projectId, branch, request });
      else return new Response("No such action", { status: 404 });
    }

    case "HEAD":
      return 204;

    default:
      throw 405;
  }
});
