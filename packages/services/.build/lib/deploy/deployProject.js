"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = deployProject;
var _builder = require("@queue-run/builder");
var _ms = _interopRequireDefault(require("ms"));
var _tinyInvariant = _interopRequireDefault(require("tiny-invariant"));
var _eventSource = require("./eventSource");
var _prepareQueues = require("./prepareQueues");
var _updateAlias = _interopRequireDefault(require("./updateAlias"));
var _uploadLambda = _interopRequireDefault(require("./uploadLambda"));
var _withBuildDirs = _interopRequireDefault(require("./withBuildDirs"));
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function deployProject({ archive , deploy , signal  }) {
    const start = Date.now();
    console.info("🐇 Starting deploy %s", deploy.id);
    const { lambdaRuntime , queues , zip  } = await (0, _withBuildDirs).default({
        archive,
        signal
    }, async ({ sourceDir , targetDir  })=>await (0, _builder).buildProject({
            full: true,
            signal,
            sourceDir,
            targetDir
        })
    );
    if (signal.aborted) throw new Error();
    const lambdaName = `backend-${deploy.projectId}`;
    const queuePrefix = `${deploy.projectId}-${deploy.branchId}__`;
    const lambdaAlias = `${lambdaName}-${deploy.branchId}`;
    const lambdaTimeout = 30;
    const queueTimeout = lambdaTimeout * 6;
    const versionARN = await prepareLambda({
        envVars: {
            NODE_ENV: "production",
            QUEUE_RUN_PROJECT: deploy.projectId,
            QUEUE_RUN_BRANCH: deploy.branchId
        },
        lambdaName,
        lambdaRuntime,
        zip
    });
    if (signal.aborted) throw new Error();
    // From this point on, we hope to complete successfully and so ignore abort signal
    await switchOver({
        lambdaAlias,
        queues,
        queuePrefix,
        versionARN,
        queueTimeout
    });
    console.info("🐇 Done in %s", (0, _ms).default(Date.now() - start));
}
async function prepareLambda({ envVars , lambdaName , lambdaRuntime , zip  }) {
    var ref;
    const lambdaTimeout = 30;
    // Upload new Lambda function and publish a new version.
    // This doesn't make any difference yet: event sources are tied to an alias,
    // and the alias points to an earlier version (or no version on first deploy).
    const versionARN = await (0, _uploadLambda).default({
        envVars,
        lambdaName,
        lambdaTimeout,
        lambdaRuntime,
        zip
    });
    // goose-bump:50 => goose-bump:goose-bump-main
    const version = (ref = versionARN.match(/(\d)+$/)) === null || ref === void 0 ? void 0 : ref[1];
    (0, _tinyInvariant).default(version);
    return versionARN;
}
async function switchOver({ lambdaAlias , queues , queuePrefix , versionARN , queueTimeout  }) {
    const aliasARN = versionARN.replace(/(\d+)$/, lambdaAlias);
    // Create queues that new version expects, and remove triggers for event
    // sources that new version does not understand.
    const queueARNs = await (0, _prepareQueues).createQueues({
        queues,
        prefix: queuePrefix,
        queueTimeout
    });
    await (0, _eventSource).removeTriggers({
        lambdaARN: aliasARN,
        sourceARNs: queueARNs
    });
    // Update alias to point to new version.
    //
    // The alias includes the branch name, so if you parallel deploy in two
    // branches, you would have two aliases pointing to two different published
    // versions:
    //
    //    {projectId}-{branch} => {projectId}:{version}
    await (0, _updateAlias).default({
        aliasARN,
        versionARN
    });
    // Add triggers for queues that new version can handle.  We do that for the
    // alias, so we only need to add new triggers, existing triggers carry over:
    //
    //   trigger {projectId}-{branch}__{queueName} => {projectId}-{branch}
    await (0, _eventSource).addTriggers({
        lambdaARN: aliasARN,
        sourceARNs: queueARNs
    });
    console.info("λ: Using %s version %s", aliasARN.split(":").slice(-1), versionARN.split(":").slice(-1));
    // Delete any queues that are no longer needed.
    await (0, _prepareQueues).deleteOldQueues({
        prefix: queuePrefix,
        queueARNs
    });
}
