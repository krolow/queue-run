import { asFetch, CloudFrontEvent, json } from "./fetch";

export const handler = (event: CloudFrontEvent) =>
  asFetch(event, (request) => {
    return json({
      host: request.headers.get("host"),
      url: request.url,
      method: request.method,
    });
  });

handler({
  Records: [
    {
      cf: {
        config: {
          // @ts-ignore
          distributionId: "EXAMPLE",
        },
        request: {
          uri: "/test",
          method: "GET",
          clientIp: "2001:cdba::3257:9652",
          headers: {
            host: [
              {
                key: "Host",
                value: "d123.cf.net",
              },
            ],
          },
        },
      },
    },
  ],
})
  .then(console.log)
  .catch(console.error);
