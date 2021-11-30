/* eslint-disable @typescript-eslint/ban-ts-comment */
import { IAM } from "@aws-sdk/client-iam";
import { Lambda } from "@aws-sdk/client-lambda";
import { SQS } from "@aws-sdk/client-sqs";

// @ts-ignore
export const iam = new IAM({ profile: "untitled" });

// @ts-ignore
export const lambda = new Lambda({ profile: "untitled" });

// @ts-ignore
export const sqs = new SQS({ profile: "untitled" });
