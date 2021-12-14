import type { CredentialProvider } from "@aws-sdk/types";

// This function swaps AWS environment variables.
//
// We allow backend function to set their own AWS variables (access key,
// session, region, etc).  We also have our own variables, which we need to
// access various resources (queues, database, logging, etc).
//
// When building the backend, we alias the user's AWS environment variables, so
// they don't get overwritten by AWS.
//
// When the backend starts, we extract the AWS environment variables we need, and
// turn those into client configuration object (returned from this function).
//
// Then we un-alias from user's AWS environment variables.
export default function swapAWSEnvVars(): {
  branch: string;
  credentials: CredentialProvider;
  projectId: string;
  region: string;
} {
  const credentials = {
    sessionToken: process.env.AWS_SESSION_TOKEN!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  };
  const region = process.env.AWS_REGION!;

  // Allow backend function to bring their own AWS environment variables.
  // Our AWS access is of no use to them.
  //
  // These were aliased when the Lambda function was created, so they won't
  // conflict with environment variables set by AWS.
  const aliasPrefix = "ALIASED_FOR_CLIENT__";
  for (const key of [
    "AWS_SESSION_TOKEN",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION",
  ]) {
    const aliased = process.env[aliasPrefix + key];
    if (aliased) process.env[key] = aliased;
    else delete process.env[key];
  }

  const branch = process.env.QUEUE_RUN_BRANCH!;
  const projectId = process.env.QUEUE_RUN_PROJECT!;

  return { branch, credentials: async () => credentials, projectId, region };
}
