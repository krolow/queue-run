/// <reference types="node" />
import { Request, Response } from 'node-fetch';
import { MatchFunction } from 'path-to-regexp';

declare type AuthenticatedUser = {
    id: string;
    [key: string]: unknown;
};
declare type AuthenticateMethod = (request: Request) => AuthenticatedUser | Promise<AuthenticatedUser>;
declare type OnRequest = (request: Request) => void | Promise<void>;
declare type OnResponse = (request: Request, response: Response) => void | Promise<void>;
declare type OnError = (error: Error, reference?: unknown) => void | Promise<void>;
declare type Middleware = {
    authenticate?: AuthenticateMethod | null;
    onRequest?: OnRequest | null;
    onResponse?: OnResponse | null;
    onError?: OnError | null;
};

declare type PushMessageFunction = (params: {
    body: Buffer | string | object;
    dedupeId?: string;
    groupId?: string;
    params?: {
        [key: string]: string;
    };
    queueName: string;
    user?: AuthenticatedUser;
}) => Promise<string>;

declare type Globals = {
    pushMessage: PushMessageFunction;
};
declare global {
    var _qr: Globals;
}

declare type SQSMessage = {
    attributes: {
        ApproximateFirstReceiveTimestamp: string;
        ApproximateReceiveCount: string;
        MessageDeduplicationId?: string;
        MessageGroupId?: string;
        SenderId: string;
        SentTimestamp: string;
        SequenceNumber?: string;
    };
    awsRegion: string;
    body: string;
    eventSource: "aws:sqs";
    eventSourceARN: string;
    md5OfBody: string;
    messageAttributes: {
        [key: string]: {
            stringValue: string;
        };
    };
    messageId: string;
    receiptHandle: string;
};

declare function loadModule<Handler = () => Promise<void>, Config = {}>(name: string): Promise<Readonly<{
    handler: Handler;
    config: Config;
} & Middleware> | null>;

declare type Services = {
    queues: Map<string, Queue>;
    routes: Map<string, Route>;
};
declare type Queue = {
    checkContentType: (type: string) => boolean;
    filename: string;
    isFifo: boolean;
    path: string | null;
    queueName: string;
    timeout: number;
};
declare type Route = {
    checkContentType: (type: string) => boolean;
    checkMethod: (method: string) => boolean;
    filename: string;
    match: MatchFunction<{
        [key: string]: string;
    }>;
    queue?: Queue;
    timeout: number;
};
declare function loadServices(dirname: string): Promise<Services>;
declare function displayServices({ routes, queues }: Services): void;

declare function handler(event: LambdaEvent, context: LambdaContext): Promise<BackendLambdaResponse | SQSBatchResponse | undefined>;
declare type LambdaEvent = {
    Records: Array<SQSMessage>;
} | BackendLambdaRequest;
declare type LambdaContext = {
    functionName: string;
    functionVersion: string;
    invokedFunctionArn: string;
    memoryLimitInMB: string;
    awsRequestId: string;
    logGroupName: string;
    getRemainingTimeInMillis: () => number;
    callbackWaitsForEmptyEventLoop: boolean;
};
declare type SQSBatchResponse = {
    batchItemFailures: Array<{
        itemIdentifier: string;
    }>;
};
declare type BackendLambdaRequest = {
    body?: string;
    headers: Record<string, string>;
    method: string;
    requestId?: string;
    url: string;
};
declare type BackendLambdaResponse = {
    body: string;
    bodyEncoding: "text" | "base64";
    headers: Record<string, string>;
    statusCode: number;
};

export { Queue, Route, Services, displayServices, handler, loadModule, loadServices };
