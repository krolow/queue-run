import { Lambda } from "@aws-sdk/client-lambda";

export async function addTriggers({
  lambdaARN,
  region,
  sourceARNs,
}: {
  lambdaARN: string;
  region: string;
  sourceARNs: string[];
}) {
  const lambda = new Lambda({ region });

  if (sourceARNs.length === 0) return;
  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaARN,
  });
  const arnToUUID = new Map<string, string>(
    EventSourceMappings?.map(
      ({ EventSourceArn, UUID }) => [EventSourceArn, UUID] as [string, string]
    )
  );

  const created = await Promise.all(
    sourceARNs.map(async (arn) => {
      const uuid = arnToUUID.get(arn);
      if (uuid) {
        await lambda.updateEventSourceMapping({
          UUID: uuid,
          FunctionName: lambdaARN,
        });
        return false;
      } else {
        const { UUID } = await lambda.createEventSourceMapping({
          Enabled: true,
          FunctionName: lambdaARN,
          EventSourceArn: arn,
        });
        if (!UUID) throw new Error(`Could not create event source for ${arn}`);
        return true;
      }
    })
  );
  if (created.some(Boolean)) console.info("λ: Added new triggers");
}

export async function removeTriggers({
  lambdaARN,
  region,
  sourceARNs,
}: {
  lambdaARN: string;
  region: string;
  sourceARNs: string[];
}) {
  const lambda = new Lambda({ region });

  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaARN,
  });
  if (!EventSourceMappings) return;

  const set = new Set(sourceARNs);
  const removing = EventSourceMappings.filter(
    ({ EventSourceArn }) => EventSourceArn && !set.has(EventSourceArn)
  );
  if (removing.length === 0) return;

  await Promise.all(
    removing.map(({ UUID }) => lambda.deleteEventSourceMapping({ UUID }))
  );
  console.info("λ: Removed old triggers");
}
