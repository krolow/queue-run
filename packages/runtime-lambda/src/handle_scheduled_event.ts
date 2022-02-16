import { handleScheduledJob, NewExecutionContext } from "queue-run";
import invariant from "tiny-invariant";

export type ScheduledEvent =
  | {
      "detail-type": "Scheduled Event";
      account: string;
      detail: {};
      id: string;
      region: string;
      resources: [`arn:aws:events:${string}:${string}:rule/${string}`];
      source: "aws.events";
      time: string;
    }
  | { source: "cli.schedule"; schedule: string };

export default async function handleScheduledEvent(
  event: ScheduledEvent,
  newExecutionContext: NewExecutionContext
): Promise<void> {
  const name =
    "schedule" in event
      ? event.schedule
      : event.resources[0]?.match(/:rule\/qr-.*?\.(.*)$/)?.[1];
  invariant(name, "Could not extract name from event");
  const jobId = "id" in event ? event.id : crypto.randomUUID!();
  await handleScheduledJob({ jobId, name, newExecutionContext });
}
