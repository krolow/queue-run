/// <reference types="node" />
import Lambda from '@aws-sdk/client-lambda';
import { QueueConfig } from '@queue-run/runtime';
import swc from '@swc/core';

declare type Topology = {
    queues: Route<QueueConfig>;
    routes: Route;
};
declare class Route<Config = {}> {
    path: string;
    regex: RegExp;
    param?: string;
    children: Record<string, Route>;
    filename?: string;
    config?: Config;
    constructor(path: string, filename?: string, config?: Config);
    count(): number;
    add(path: string, filename: string, config: Config): void;
    displayTree(): string[];
    _displayTree(): string[];
    displayFlat(): string[];
    _displayFlat(): [string, string][];
}

declare function buildProject({ full, signal, sourceDir, targetDir, }: {
    full?: boolean;
    signal?: AbortSignal;
    sourceDir: string;
    targetDir: string;
}): Promise<{
    lambdaRuntime: Lambda.Runtime;
    zip?: Uint8Array;
} & Topology>;

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
