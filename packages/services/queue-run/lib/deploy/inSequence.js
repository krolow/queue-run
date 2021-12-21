"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.deployInSequence = deployInSequence;
var _ms = _interopRequireDefault(require("ms"));
var _nodeAbortController = require("node-abort-controller");
var _state = require("./state");
var _storage = require("./storage");
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function deployInSequence({ deployId , signal: signal1  }, runDeploy) {
    console.info("Starting deploy %s", deployId);
    const deploy = await (0, _state).getDeploy(deployId);
    if (!deploy) return console.error("Deploy %s not found, bailing", deployId);
    // FIFO guarantees that deploy jobs run in order, and we don't have duplicates
    // in the queue. The same deploy can run in parallel, if the previous run
    // crashed or timed out.
    if (deploy.startedAt) {
        console.info("Deploy %s not finished in time, marking as failed, and scheduling next deploy", deployId);
        if (!deploy.completedAt) await (0, _state).markDeployCompleted(deployId, "failed");
        // If there's doubt, we call queueNextDeploy
        return queueNextDeploy(deploy);
    }
    // If there are other deploys waiting to run cancel them, we only want the
    // most recent deploy
    await (0, _state).cancelEarlierDeploys(deploy);
    // We only allow user to have one running deploy at a time
    if (await (0, _state).countActiveDeploys(deploy.projectId) > 0) {
        console.info("Deploy %s blocked, another deploy is in progress", deployId);
        return;
    }
    await (0, _state).markDeployStarted(deployId);
    try {
        await watchDeployStatus({
            deployId,
            signal: signal1
        }, async (signal)=>{
            const archive = await (0, _storage).readS3Archive(deployId);
            await runDeploy({
                archive,
                deploy,
                signal
            });
            if (signal.aborted) return;
            await (0, _state).markDeployCompleted(deployId, "success");
            console.info("Deploy %s completed successfully", deployId);
        });
    } catch (error) {
        console.error("Deploy %s failed", deployId, error);
        await (0, _state).markDeployCompleted(deployId, "failed");
    }
    return await queueNextDeploy(deploy);
}
async function watchDeployStatus({ deployId , signal: timeout  }, cb) {
    const cancel = new _nodeAbortController.AbortController();
    timeout.addEventListener("abort", ()=>cancel.abort()
    );
    setInterval(async function pollDeployStatus() {
        const deploy = await (0, _state).getDeploy(deployId);
        if (!deploy || deploy.completedAt) cancel.abort();
    }, (0, _ms).default("5s"));
    try {
        await Promise.race([
            cb(cancel.signal),
            new Promise((resolve)=>cancel.signal.addEventListener("abort", resolve)
            ), 
        ]);
        if (timeout.aborted) throw new Error("Deploy timed out");
        if (cancel.signal.aborted) throw new Error("Deploy cancelled by user");
    } finally{
        cancel.abort();
    }
}
// When we're done with this deploy, queue the next waiting deploy
async function queueNextDeploy(deploy) {
    const nextDeployId = await (0, _state).getNextWaitingDeploy(deploy);
    if (nextDeployId) {
    // TODO queue with { deployId } groupId = project/branch
    }
}
