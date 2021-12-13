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
  requestId: string;
  url: string;
};

export type BackendLambdaResponse = {
  body: string;
  headers: Record<string, string>;
  statusCode: number;
};
