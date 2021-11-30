import { JSONObject } from "../types";
import { SQSMessage } from "./SQSEvent";

export default function getPayload(message: SQSMessage): JSONObject | string {
  const type = message.messageAttributes["type"]?.stringValue;
  if (type === "text/plain") return message.body;
  if (type === "application/json") return JSON.parse(message.body);
  try {
    return JSON.parse(message.body);
  } catch {
    return message.body;
  }
}
