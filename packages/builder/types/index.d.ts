/// <reference types="node" />
import Lambda from '@aws-sdk/client-lambda';
import { QueueConfig } from '@queue-run/runtime';
import { MatchFunction } from 'path-to-regexp';
import swc from '@swc/core';

declare type Topology = {
    queues: Map<string, Route<QueueConfig>>;
    routes: Map<string, Route<{}>>;
};
declare type Route<Config = {}> = {
    filename: string;
    match: MatchFunction;
    config: Config;
};
declare function loadTopology(targetDir: string): Promise<Topology>;
declare function showTopology({ queues, routes }: Topology): Promise<void>;

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

declare function moduleLoader({ dirname: dirname, onReload, }: {
    dirname: string;
    onReload?: (filename: string) => void;
}): Promise<void>;

export { buildProject, getRuntime, loadTopology, moduleLoader, showTopology };
