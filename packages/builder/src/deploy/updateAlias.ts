import { Lambda } from "@aws-sdk/client-lambda";
import invariant from "tiny-invariant";

export default async function updateAlias({
  aliasArn,
  region,
  versionArn,
}: {
  aliasArn: string;
  region: string;
  versionArn: string;
}): Promise<string> {
  const [lambdaName, alias] = aliasArn.match(/([^:]+):([^:]+)$/)!.slice(1);
  invariant(alias && lambdaName);
  const version = versionArn.match(/\d+$/)?.[0];
  invariant(version);
  const lambda = new Lambda({ region });

  const { AliasArn: arn } = await lambda
    .getAlias({
      FunctionName: lambdaName,
      Name: alias,
    })
    .catch(() => ({ AliasArn: undefined }));

  if (!arn) {
    const { AliasArn: arn } = await lambda.createAlias({
      FunctionName: lambdaName,
      FunctionVersion: version,
      Name: alias,
    });
    invariant(arn, "Failed to create alias");
    return arn;
  }

  await retainProvisionedConcurrency(
    {
      lambda,
      lambdaName,
    },
    () =>
      lambda.updateAlias({
        FunctionName: lambdaName,
        FunctionVersion: version,
        Name: alias,
      })
  );

  return arn;
}

// Say we have provisioned concurrency setup from a previous deployment (latest
// = 5). We make a new deployment and set an alias (latesst = 6).  That alias
// has weight traffic 0% to version 6 and 100% to version 5, which has
// provisioned instance. And attempting to set the provisioned concurrency for
// latest will fail with:
//
// "InvalidParameterValueException: Alias with weights can not be used with Provisioned Concurrency"
//
// So we're going to delete the provisioned concurrency and recreate it after we
// update the alias.
async function retainProvisionedConcurrency(
  {
    lambda,
    lambdaName,
  }: {
    lambda: Lambda;
    lambdaName: string;
  },
  callback: () => Promise<T>
): Promise<T> {
  const { ProvisionedConcurrencyConfigs: configs } =
    await lambda.listProvisionedConcurrencyConfigs({
      FunctionName: lambdaName,
    });
  const provisioned = configs?.[0]?.RequestedProvisionedConcurrentExecutions;

  if (provisioned) {
    await lambda.deleteProvisionedConcurrencyConfig({
      FunctionName: lambdaName,
      Qualifier: "current",
    });
  }

  const result = await callback();

  if (provisioned) {
    await lambda.putProvisionedConcurrencyConfig({
      FunctionName: lambdaName,
      Qualifier: "current",
      ProvisionedConcurrentExecutions: provisioned,
    });
  }

  return result;
}
