export default async function (event: CloudFrontEvent): Promise<Response> {
  const request = event.Records?.[0].cf?.request;
  if (request) {
    return {
      status: "422",
      statusDescription: "Unprocessable Entity",
      body: "",
      headers: {},
    };
  }

  return {
    status: "200",
    statusDescription: "OK",
    headers: {
      vary: [
        {
          key: "Vary",
          value: "*",
        },
      ],
      "last-modified": [
        {
          key: "Last-Modified",
          value: "2017-01-13",
        },
      ],
    },
    body: JSON.stringify({ event, env: process.env }, null, 2),
  };
}

type Response = {
  body: string;
  headers: Headers;
  status: string;
  statusDescription: string;
};

type Request = {
  body: {
    action: "read-only";
    data: string;
    encoding: "base64";
    inputTruncated: false;
  };
  clientIp: string;
  headers: Headers;
  method: "GET" | "POST" | "PUT" | "OPTIONS" | string;
  querystring: "";
  uri: string /* eg "/" */;
};

type Headers = Record<
  string /* eg x-forwarded-for */,
  Array<{
    key: string /* eg X-Forwarded-For */;
    value: string;
  }>
>;

type CloudFrontEvent = {
  Records?: Array<{
    cf?: {
      config: { eventType: "viewer-request" | string; requestId: string };
      request: Request;
    };
  }>;
};
