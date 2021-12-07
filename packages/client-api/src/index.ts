import { asFetch, CloudFrontEvent, json } from "./fetch";

export const handler = (event: CloudFrontEvent) =>
  asFetch(event, (request) => {
    return json(request);
  });
