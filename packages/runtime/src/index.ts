import type { LambdaEvent as LambdaEvent } from "./LambdaEvent";
import handleSQSMessages from "./sqs";

export async function handler(event: LambdaEvent) {
  await Promise.all([handleSQSMessages(event)]);
}
