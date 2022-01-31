import { Lambda } from "@aws-sdk/client-lambda";
import ora from "ora";

export async function addTriggers({
  lambdaArn,
  sourceArns,
  region,
}: {
  lambdaArn: string;
  sourceArns: string[];
  region: string;
}) {
  const spinner = ora("Adding triggers").start();
  const lambda = new Lambda({ region });
  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaArn,
  });
  const arnToUUID = new Map<string, string>(
    EventSourceMappings?.map(
      ({ EventSourceArn, UUID }) => [EventSourceArn, UUID] as [string, string]
    )
  );

  const created = await Promise.all(
    sourceArns.map(async (arn) => {
      const uuid = arnToUUID.get(arn);
      if (uuid) {
        await lambda.updateEventSourceMapping({
          UUID: uuid,
          FunctionName: lambdaArn,
        });
        return false;
      } else {
        const { UUID } = await lambda.createEventSourceMapping({
          Enabled: true,
          EventSourceArn: arn,
          FunctionName: lambdaArn,
          FunctionResponseTypes: ["ReportBatchItemFailures"],
        });
        if (!UUID) throw new Error(`Could not create event source for ${arn}`);
        return true;
      }
    })
  );
  spinner.succeed(`Added ${created.filter(Boolean).length} new triggers`);
}

export async function removeTriggers({
  lambdaArn,
  sourceArns,
  region,
}: {
  lambdaArn: string;
  sourceArns: string[];
  region: string;
}) {
  const spinner = ora("Removing triggers").start();
  const lambda = new Lambda({ region });

  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaArn,
  });

  const set = new Set(sourceArns);
  const removing =
    EventSourceMappings?.filter(
      ({ EventSourceArn }) => EventSourceArn && !set.has(EventSourceArn)
    ) ?? [];

  await Promise.all(
    removing.map(({ UUID }) => lambda.deleteEventSourceMapping({ UUID }))
  );
  spinner.succeed(`Removed ${removing.length} old triggers`);
}
