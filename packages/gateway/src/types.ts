// Cloudfront Lambda@Edge request
// https://docs.aws.amazon.com/lambda/latest/dg/lambda-edge.html
export type LambdaEdgeRequest = {
  Records: Array<{
    cf: {
      config: { distributionId: string };
      request: {
        body: { data: string; encoding: "base64" };
        clientIp: string;
        method: string;
        uri: string; // path only
        headers: { [key: string]: Array<{ key: string; value: string }> };
      };
    };
  }>;
};

// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-generating-http-responses-in-requests.html
export type LambdaEdgeResponse = {
  body?: string;
  bodyEncoding?: "text" | "base64";
  headers?: { [key: string]: Array<{ value: string }> };
  status: string;
  statusDescription?: string;
};

// AWS API Gateway Event
export type APIGatewayEvent = {
  version: "2.0";
  rawPath: string;
  rawQueryString: string;
  cookies?: string[];
  headers: Record<string, string>;
  requestContext: {
    accountId: string;
    domainName: string;
    domainPrefix: string;
    requestId: string;
    http: {
      method: string;
      path: string;
      protocol: "HTTP/1.1";
      sourceIp: string;
      userAgent: string;
    };
  };
  body?: string;
  isBase64Encoded?: boolean;
};

export type APIGatewayResponse = {
  body: string;
  headers: Record<string, string>;
  isBase64Encoded: boolean;
  statusCode: number;
};

// Request/response to backend Lambda
export type BackendLambdaRequest = {
  body?: string;
  headers: Record<string, string>;
  method: string;
  requestId?: string;
  url: string;
};

export type BackendLambdaResponse = {
  body: string;
  bodyEncoding: "text" | "base64";
  headers: Record<string, string>;
  statusCode: number;
};
