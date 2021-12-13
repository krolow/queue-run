import { Request } from "node-fetch";
import pushMessage from "./pushMessage";

export default async function http(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/queue")) {
    await pushMessage({ request });
  } else return new Response("OK", { status: 200 });
}
