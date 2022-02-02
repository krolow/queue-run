import { handleScheduledJob, LocalStorage } from "queue-run";
import invariant from "tiny-invariant";

export type ScheduledEvent = {
  "detail-type": "Scheduled Event";
  account: string;
  detail: {};
  id: string;
  region: string;
  resources: [`arn:aws:events:${string}:${string}:rule/${string}`];
  source: "aws.events";
  time: string;
};

export default async function handleScheduledEvent(
  event: ScheduledEvent,
  newLocalStorage: () => LocalStorage
): Promise<void> {
  const name = event.resources[0]?.match(/:rule\/qr-.*?\.(.*)$/)?.[1];
  invariant(name, "Could not extract name from event");
  await handleScheduledJob({ jobId: event.id, name, newLocalStorage });
}
