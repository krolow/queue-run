/// <reference types="node" />
import Lambda from '@aws-sdk/client-lambda';
import { QueueConfig } from '@queue-run/runtime';
import swc from '@swc/core';

declare function buildProject({ full, signal, sourceDir, targetDir, }: {
    full?: boolean;
    signal?: AbortSignal;
    sourceDir: string;
    targetDir: string;
}): Promise<{
    lambdaRuntime: Lambda.Runtime;
    queues: Map<string, QueueConfig>;
    zip?: Uint8Array;
}>;

declare type RuntimeVersion = {
    nodeVersion: "12" | "14";
    lambdaRuntime: Lambda.Runtime;
    jscTarget: swc.JscTarget;
};
declare function getRuntime(dirname: string): Promise<RuntimeVersion>;

declare function moduleLoader({ dirname: dirname, watch, }: {
    dirname: string;
    watch: boolean;
}): Promise<void>;

export { buildProject, getRuntime, moduleLoader };
