import { Lambda } from "@aws-sdk/client-lambda";

const lambda = new Lambda({});

export async function addTriggers(lambdaName: string, sourceArns: string[]) {
  if (sourceArns.length === 0) return;
  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaName,
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
          FunctionName: lambdaName,
        });
        return false;
      } else {
        const { UUID } = await lambda.createEventSourceMapping({
          Enabled: true,
          FunctionName: lambdaName,
          EventSourceArn: arn,
        });
        if (!UUID) throw new Error(`Could not create event source for ${arn}`);
        return true;
      }
    })
  );
  if (created.some(Boolean)) console.info("λ: Added new triggers");
}

export async function removeTriggers(lambdaName: string, sourceArns: string[]) {
  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaName,
  });
  if (!EventSourceMappings) return;

  const set = new Set(sourceArns);
  const removing = EventSourceMappings.filter(
    ({ EventSourceArn }) => EventSourceArn && !set.has(EventSourceArn)
  );
  if (removing.length === 0) return;

  await Promise.all(
    removing.map(({ UUID }) => lambda.deleteEventSourceMapping({ UUID }))
  );
  console.info("λ: Removed old triggers");
}
