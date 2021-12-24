import { SendMessageCommandInput, SQS } from "@aws-sdk/client-sqs";
import crypto from "crypto";
import type { AuthenticatedUser } from "queue-run";
import invariant from "tiny-invariant";
import { URLSearchParams } from "url";
import { handleOneSQSMessage } from "./handleSQSMessages";
import type { SQSMessage } from "./index";

export default async function pushMessage({
  body,
  dedupeId,
  groupId,
  params,
  queueName,
  slug,
  sqs,
  user,
}: {
  body: Buffer | string | object | Request;
  dedupeId?: string;
  groupId?: string;
  params?: { [key: string]: string };
  queueName: string;
  slug: string;
  sqs: SQS;
  user?: AuthenticatedUser | null;
}): Promise<string> {
  const isDevServer = (await sqs.config.region()) === "localhost";

  const queueURL = isDevServer
    ? `http://localhost/queue/${slug}__${queueName}`
    : await getQueueURL({ queueName, slug, sqs });

  // When queuing directly from request, we support various content types like
  // multipart form data, and URL encoded. What we store in the queue is either
  // JSON, plain text, or binary.
  if (body instanceof Request) body = await messageBodyFromRequest(body);

  const contentType = Buffer.isBuffer(body)
    ? "application/octet-stream"
    : typeof body === "string"
    ? "text/plain"
    : "application/json";
  const messageBody = Buffer.isBuffer(body)
    ? body.toString("base64")
    : typeof body === "string"
    ? body
    : JSON.stringify(body);

  const message: SendMessageCommandInput = {
    QueueUrl: queueURL,
    MessageBody: messageBody,
    MessageAttributes: {
      "Content-Type": { DataType: "String", StringValue: contentType },
      params: {
        DataType: "String",
        StringValue: new URLSearchParams(params).toString(),
      },
      ...(user && { userId: { DataType: "String", StringValue: user.id } }),
    },
    MessageGroupId: groupId,
    MessageDeduplicationId: dedupeId,
  };

  if (isDevServer) {
    return await sendMessageInDev({ message, sqs });
  } else {
    const { MessageId: messageId } = await sqs.sendMessage(message);
    invariant(messageId);
    return messageId;
  }
}

async function sendMessageInDev({
  message: sqsMessage,
  sqs,
}: {
  message: SendMessageCommandInput;
  sqs: SQS;
}) {
  invariant(sqsMessage.MessageBody);
  invariant(sqsMessage.QueueUrl);
  invariant(sqsMessage.MessageAttributes);

  const queueName = sqsMessage.QueueUrl.split("/").pop();
  const messageId = crypto.randomBytes(8).toString("hex");
  const timestamp = Date.now().toString();
  const message: SQSMessage = {
    messageId,
    body: sqsMessage.MessageBody,
    attributes: {
      MessageGroupId: sqsMessage.MessageGroupId,
      MessageDeduplicationId: sqsMessage.MessageDeduplicationId,
      ApproximateFirstReceiveTimestamp: timestamp,
      ApproximateReceiveCount: "1",
      SentTimestamp: timestamp,
      SequenceNumber: "1",
      SenderId: "sender",
    },
    messageAttributes: Object.fromEntries(
      Object.entries(sqsMessage.MessageAttributes).map(([key, value]) => [
        key,
        { stringValue: value.StringValue! },
      ])
    ),
    receiptHandle: crypto.randomBytes(8).toString("hex"),
    eventSourceARN: `arn:aws:sqs:localhost:12345:${queueName}`,
    awsRegion: "localhost",
    eventSource: "aws:sqs",
    md5OfBody: crypto
      .createHash("md5")
      .update(sqsMessage.MessageBody)
      .digest("hex"),
  };

  const endTime = Date.now() + 30 * 1000;
  const remainingTime = Math.max(0, endTime - Date.now());

  setTimeout(() => handleOneSQSMessage({ message, sqs, remainingTime }));
  return messageId;
}

// Get the queue URL, and throw Response if queue doesn't exist.
async function getQueueURL({
  queueName,
  slug,
  sqs,
}: {
  queueName: string;
  slug: string;
  sqs: SQS;
}): Promise<string> {
  const qualified = `${slug}__${queueName}`;
  try {
    const { QueueUrl } = await sqs.getQueueUrl({ QueueName: qualified });
    invariant(QueueUrl);
    return QueueUrl;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AWS.SimpleQueueService.NonExistentQueue"
    ) {
      console.error("No access to queue", qualified);
      throw new Error("No access to queue");
    } else throw error;
  }
}

async function messageBodyFromRequest(
  request: Request
): Promise<Buffer | string | object> {
  const contentType = request.headers.get("content-type");
  const mimeType = contentType?.split(";")[0];

  switch (mimeType) {
    case "application/json": {
      try {
        return await request.json();
      } catch (error) {
        throw new Response("application/json: not a valid JSON document", {
          status: 422,
        });
      }
    }

    case "application/octet-stream": {
      const buffer = await request.buffer();
      if (!buffer.byteLength)
        throw new Response("application/octet-stream: no message body", {
          status: 422,
        });
      return buffer;
    }

    case "application/x-www-form-urlencoded": {
      const text = await request.text();
      const params = new URLSearchParams(text);
      return Object.fromEntries(params.entries());
    }

    case "multipart/form-data": {
      try {
        return await formDataToObject(request);
      } catch (error) {
        throw new Response(String(error), { status: 422 });
      }
    }

    case "text/plain": {
      const text = await request.text();
      if (!text)
        throw new Response("text/plain: no message body", { status: 422 });
      return text;
    }

    default: {
      throw new Response("Unsupported media type", { status: 415 });
    }
  }
}

async function formDataToObject(request: Request) {
  const form = await request.form();
  return Array.from(form.entries()).reduce(
    (fields, [name, { contentType, data, filename }]) => {
      if (filename) throw new Error("multipart/form-data: files not supported");
      if (!name) throw new Error("multipart/form-data: part without name");
      const encoding = contentType?.match(/;\s*charset=([^;]+)/)?.[1];
      return {
        ...fields,
        // @ts-ignore
        [name]: data.toString(encoding ?? "utf-8"),
      };
    },
    {}
  );
}
