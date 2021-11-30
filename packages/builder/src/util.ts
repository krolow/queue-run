export function getEnvPrefix() {
  return (
    {
      development: "dev",
      production: "prod",
    }[process.env.NODE_ENV ?? "development"] ?? "prod"
  );
}

export function getLambdaName(projectId: string): string {
  const env = getEnvPrefix();
  return `${projectId}-${env}`;
}

export function queueURLToARN(queueUrl: string): string {
  const [, , hostname, accountId, name] = queueUrl.split("/");
  const region = hostname!.split(".")[1];
  return `arn:aws:sqs:${region}:${accountId}:${name}`;
}
