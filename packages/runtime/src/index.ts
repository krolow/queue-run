import { SQS } from "@aws-sdk/client-sqs";
import type { BackendLambdaRequest } from "@queue-run/gateway";
import { URL } from "url";
import { asFetchRequest } from "./asFetch";
import swapAWSEnvVars from "./environment";
import handleSQSMessages, { SQSMessage } from "./handleSQSMessages";
import httpRoute from "./httpRoute";
import "./polyfill";
import pushMessage from "./pushMessage";
export { default as loadModule } from "./loadModule";
export * from "./loadServices";

const { branch, projectId, region, ...clientConfig } =
  process.env.NODE_ENV === "production"
    ? swapAWSEnvVars()
    : {
        branch: "main",
        projectId: "grumpy-sunshine",
        region: "localhost",
      };

export async function handler(event: LambdaEvent, context: LambdaContext) {
  const { getRemainingTimeInMillis } = context;

  if ("Records" in event) {
    const messages = event.Records.filter(
      (record) => record.eventSource === "aws:sqs"
    );
    if (messages.length > 0) {
      const sqs = new SQS({ ...clientConfig, region });
      await handleSQSMessages({ getRemainingTimeInMillis, messages, sqs });
    }
  } else if ("url" in event) {
    return await asFetchRequest(event, async (request) => {
      const { pathname } = new URL(request.url);
      if (pathname.startsWith("/queue/")) {
        const sqs = new SQS({ ...clientConfig, region });
        return await pushMessage({
          branch,
          getRemainingTimeInMillis,
          projectId,
          request,
          sqs,
        });
      } else return await httpRoute(request);
    });
  }
}

declare type LambdaEvent =
  | { Records: Array<SQSMessage> }
  | BackendLambdaRequest;

declare type LambdaContext = {
  functionName: string;
  functionVersion: string;
  // The Amazon Resource Name (ARN) that's used to invoke the function. Indicates if the invoker specified a version number or alias.
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  getRemainingTimeInMillis: () => number;
  callbackWaitsForEmptyEventLoop: boolean;
};
