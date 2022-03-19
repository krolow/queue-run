import { CloudFormation, StackEvent } from "@aws-sdk/client-cloudformation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ora, { Ora } from "ora";
import invariant from "tiny-invariant";
import displayTable from "../display_table.js";

const cloudFormation = new CloudFormation({});

export async function deployStack({
  buildDir,
  httpApiId,
  lambdaArn,
  signal,
  websocketApiId,
}: {
  buildDir: string;
  httpApiId: string;
  lambdaArn: string;
  signal: AbortSignal;
  websocketApiId: string;
}) {
  const lambdaName = lambdaArn.match(/:function:(.+):/)![1];
  invariant(lambdaName);
  const stackName = lambdaName;
  const template = await readFile(path.join(buildDir, "cfn.json"), "utf8");
  const stackUpdate = {
    Capabilities: ["CAPABILITY_NAMED_IAM"],
    Parameters: [
      { ParameterKey: "httpApiId", ParameterValue: httpApiId },
      { ParameterKey: "lambdaArn", ParameterValue: lambdaArn },
      { ParameterKey: "lambdaName", ParameterValue: lambdaName },
      { ParameterKey: "websocketApiId", ParameterValue: websocketApiId },
    ],
    StackName: stackName,
    TemplateBody: template,
  };

  function cancel() {
    cloudFormation.cancelUpdateStack({ StackName: stackName });
  }

  let successful, events;
  const spinner = ora(`Deploying stack ${stackName}`).start();
  try {
    const existing = await findStack(stackName);
    const initialStatus = existing?.StackStatus;
    if (initialStatus?.endsWith("_IN_PROGRESS"))
      throw new Error(`Stack ${stackName} is currently updating`);

    if (initialStatus === "ROLLBACK_COMPLETE") {
      const existingId = existing?.StackId;
      invariant(existingId);

      spinner.text = "Previous deploy failed, deleting old stack …";
      await cloudFormation.deleteStack({ StackName: existingId });
      while (
        (await findStack(existingId))?.StackStatus?.endsWith("_IN_PROGRESS")
      )
        await new Promise((resolve) => setTimeout(resolve, 1000));

      await cloudFormation.createStack(stackUpdate);
    } else if (existing?.StackId) {
      await cloudFormation.updateStack(stackUpdate);
    } else await cloudFormation.createStack(stackUpdate);

    signal.addEventListener("abort", cancel);

    events = await waitForStackUpdate(stackName, spinner);
    const finalStatus = (await findStack(stackName))?.StackStatus;
    successful =
      finalStatus === "UPDATE_COMPLETE" || finalStatus === "CREATE_COMPLETE";
  } catch (error) {
    spinner.fail();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }

  if (successful) {
    spinner.succeed();
    displayEvents(events, [
      "CREATE_COMPLETE",
      "UPDATE_COMPLETE",
      "DELETE_COMPLETE",
    ]);
  } else {
    spinner.fail("Stack deploy failed, see above for details");
    displayEvents(events, ["CREATE_FAILED", "UPDATE_FAILED", "DELETE_FAILED"]);
    throw new Error("Stack deploy failed, see above for details");
  }
}

export async function deleteStack(lambdaName: string) {
  const cloudFormation = new CloudFormation({});
  const stackName = lambdaName;

  const spinner = ora(`Deleting stack ${stackName}`).start();
  const stack = await findStack(stackName);
  if (!stack) {
    spinner.succeed();
    return;
  }
  const stackId = stack.StackId;
  invariant(stackId);
  await cloudFormation.deleteStack({ StackName: stackId });
  const events = await waitForStackUpdate(stackId, spinner);
  spinner.succeed();
  displayEvents(events, ["DELETE_COMPLETE"]);
}

export async function getStackStatus(lambdaName: string) {
  try {
    const stack = await findStack(lambdaName);
    return stack?.StackStatus ?? "Not found";
  } catch (error) {
    return "Error";
  }
}

async function findStack(stackName: string) {
  try {
    const { Stacks } = await cloudFormation.describeStacks({
      StackName: stackName,
    });
    const stack = Stacks?.[0];
    invariant(stack);
    return stack;
  } catch (error) {
    if (
      typeof error === "object" &&
      (error as { Code: string }).Code === "ValidationError"
    )
      return null;
    else throw error;
  }
}

async function waitForStackUpdate(stackId: string, spinner: Ora) {
  let inProgress = true;
  let events;
  do {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const stacks = await cloudFormation.describeStacks({ StackName: stackId });
    const stack = stacks.Stacks?.[0];
    inProgress = stack?.StackStatus?.endsWith("_IN_PROGRESS") ?? false;
    events = (
      await cloudFormation.describeStackEvents({
        StackName: stackId,
      })
    ).StackEvents;
    const event = events?.[0];
    if (event) {
      spinner.text = `${event.LogicalResourceId} → ${formatStatus(
        event.ResourceStatus
      )}`;
    }
  } while (inProgress);
  return events ?? [];
}

function displayEvents(events: StackEvent[], statuses: string[]) {
  if (!events) return;
  displayTable({
    headers: ["Resource", "Status"],
    rows: events
      .filter((event) => statuses.includes(event.ResourceStatus!))
      .map((event) => [
        event.LogicalResourceId,
        event.ResourceStatusReason ?? formatStatus(event.ResourceStatus),
      ]),
    options: { wrapCells: true },
  });
}

function formatStatus(status: string | undefined) {
  return status?.toLocaleLowerCase().replace(/_/g, " ") ?? "unknown";
}
