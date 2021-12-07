import { asFetch, CloudFrontEvent, json } from "./fetch";

export default async function (event: CloudFrontEvent) {
  return await asFetch(event, (request) => {
    return json(request);
  });
}
