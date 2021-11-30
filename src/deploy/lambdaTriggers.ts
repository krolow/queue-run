import { Lambda } from "@aws-sdk/client-lambda";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const lambda = new Lambda({ profile: "untitled" });

export async function addTriggers(lambdaName: string, sourceArns: string[]) {
  if (sourceArns.length === 0) return;
  const { EventSourceMappings } = await lambda.listEventSourceMappings({
    FunctionName: lambdaName,
  });
  const existing = new Set(
    EventSourceMappings?.map(({ EventSourceArn }) => EventSourceArn) ?? []
  );
  const newArns = sourceArns.filter((arn) => !existing.has(arn));
  if (newArns.length === 0) return;

  console.info("λ: adding triggers %s", lambdaName, newArns);
  await Promise.all(
    newArns.map((arn) =>
      lambda.createEventSourceMapping({
        Enabled: true,
        FunctionName: lambdaName,
        EventSourceArn: arn,
      })
    )
  );
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

  console.info(
    "λ: removing triggers %s",
    lambdaName,
    removing.map(({ EventSourceArn }) => EventSourceArn)
  );
  await Promise.all(
    removing.map(({ UUID }) => lambda.deleteEventSourceMapping({ UUID }))
  );
}
