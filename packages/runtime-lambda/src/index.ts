import { SQSClient } from "@aws-sdk/client-sqs";
import { format } from "node:util";
import { logger, reportError, socket, url, warmup } from "queue-run";
import LambdaExecutionContext from "./execution_context";
import handleHTTPRequest, {
  APIGatewayHTTPEvent,
  APIGatewayResponse,
  BackendLambdaRequest,
} from "./handle_http_request";
import handleScheduledEvent, { ScheduledEvent } from "./handle_scheduled_event";
import handleSQSMessages, {
  SQSBatchResponse,
  SQSMessage,
} from "./handle_sqs_messages";
import handleWebSocketRequest, {
  APIGatewayWebSocketEvent,
} from "./handle_websocket";

// How long to wait before exiting after a fatal error.
// Gives you some time to flush the logs, send error reports, etc.
const failedExitDelay = 200;

prepareLogging();

url.baseUrl = process.env.QUEUE_RUN_URL!;
socket.url = process.env.QUEUE_RUN_WS!;

const region = process.env.AWS_REGION!;
const sqs = new SQSClient({ region });

// This must come after we create clients for SQS, DynamoDB, etc.
switchEnvVars();

// Top-level await. Do not place this inside handler.
//
// If you have provisioned concurrency, this will run when the instance loads.
// The instance sticks around until it's tasked, and only then is handler called.
await warmup((args) => new LambdaExecutionContext(args));

// Entry point for AWS Lambda
export async function handler(
  event: LambdaEvent,
  context: LambdaContext
): Promise<APIGatewayResponse | SQSBatchResponse | void> {
  try {
    if (isWebSocketRequest(event)) {
      const { connectionId } = event.requestContext;
      return await handleWebSocketRequest(
        event as APIGatewayWebSocketEvent,
        (args) => new LambdaExecutionContext({ ...args, connectionId })
      );
    }

    if (isHTTPRequest(event)) {
      return await handleHTTPRequest(
        event,
        (args) => new LambdaExecutionContext(args)
      );
    }

    if (isSQSMessages(event)) {
      const { getRemainingTimeInMillis } = context;
      const messages = event.Records.filter(
        (record) => record.eventSource === "aws:sqs"
      );
      return await handleSQSMessages({
        getRemainingTimeInMillis,
        messages,
        newExecutionContext: (args) => new LambdaExecutionContext(args),
        sqs,
      });
    }

    if (isScheduledEvent(event)) {
      return await handleScheduledEvent(
        event,
        (args) => new LambdaExecutionContext(args)
      );
    }

    throw new Error("Unknown event type");
  } catch (error) {
    await handleErrorAndFail(error);
  }
}

function isWebSocketRequest(
  event: LambdaEvent
): event is APIGatewayWebSocketEvent {
  return "requestContext" in event && "connectionId" in event.requestContext;
}

function isHTTPRequest(event: LambdaEvent): event is APIGatewayHTTPEvent {
  return (
    "requestContext" in event &&
    ("http" in event.requestContext || "httpMethod" in event.requestContext)
  );
}

function isSQSMessages(event: LambdaEvent): event is { Records: SQSMessage[] } {
  return (
    "Records" in event &&
    event.Records.every((record) => record.eventSource === "aws:sqs")
  );
}

function prepareLogging() {
  // CloudWatch logs are captured from the output stream. Messages separated with
  // NL, and multi-line messages must use CR for linebreak.
  logger.removeAllListeners("log");
  logger.addListener("log", (level, ...args) => {
    const formatted = format(...args);
    process.stdout.write(
      `[${level.toUpperCase()}] ${formatted.replace(/\n/g, "\r")}\n`
    );
  });
}

// Replace AWS_ environment variables with those set by the user,
// which were aliased during deploy.
function switchEnvVars() {
  const replace = [
    "AWS_SESSION_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
  ];
  const envVarPrefix = "ALIASED_FOR_CLIENT__";
  for (const key of replace) {
    delete process.env[key];
    const aliased = process.env[envVarPrefix + key];
    if (aliased) {
      process.env[key] = aliased;
      delete process.env[envVarPrefix + key];
    }
  }
}

async function handleErrorAndFail(error: unknown) {
  // We call reportError because our error handler reports more information
  // (eg request ID, job ID, queue name, etc)
  reportError(error instanceof Error ? error : new Error(String(error)));
  // We're going to pause the process just long enough to send error messages
  // to 3rd party service
  logger.emit("flush");
  await new Promise((resolve) => setTimeout(resolve, failedExitDelay));
  // And then we're going to crash the process, so AWS doesn't reuse this
  // Lambda instance, since we don't know what stat it's in
  throw error;
}

function isScheduledEvent(event: LambdaEvent): event is ScheduledEvent {
  return (
    "source" in event &&
    (event.source === "aws.events" || event.source === "cli.schedule")
  );
}

type LambdaEvent =
  | APIGatewayHTTPEvent
  | APIGatewayWebSocketEvent
  | { Records: Array<SQSMessage> }
  | BackendLambdaRequest
  | ScheduledEvent;

type LambdaContext = {
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  getRemainingTimeInMillis: () => number;
  callbackWaitsForEmptyEventLoop: boolean;
};
