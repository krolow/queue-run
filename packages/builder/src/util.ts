import { URL } from "url";

export function queueURLToARN(queueURL: string): string {
  // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
  const { hostname, pathname } = new URL(queueURL);
  const region = hostname.match(/^sqs\.(.+?)\.amazonaws\.com/)?.[1];
  const [accountId, name] = pathname.split("/").slice(1);
  return `arn:aws:sqs:${region}:${accountId}:${name}`;
}

export function queueURLToName(queueURL: string): string {
  // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
  const { pathname } = new URL(queueURL);
  return pathname.split("/")[2];
}
