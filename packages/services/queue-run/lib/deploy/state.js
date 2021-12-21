"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.getDeploy = getDeploy;
exports.cancelEarlierDeploys = cancelEarlierDeploys;
exports.countActiveDeploys = countActiveDeploys;
exports.markDeployStarted = markDeployStarted;
exports.markDeployCompleted = markDeployCompleted;
exports.getNextWaitingDeploy = getNextWaitingDeploy;
var _clientDynamodb = require("@aws-sdk/client-dynamodb");
var _storage = require("./storage");
const dynamoDB = new _clientDynamodb.DynamoDB({
});
async function getDeploy(deployId) {
    var ref, ref1, ref2, ref3;
    const { Items: items  } = await dynamoDB.executeStatement({
        Statement: "SELECT * FROM deploys WHERE id = ?",
        Parameters: [
            {
                S: deployId
            }
        ]
    });
    const item = items[0];
    if (!item) return null;
    const startedAt = ((ref = item.started_at) === null || ref === void 0 ? void 0 : ref.N) ? +item.started_at.N : null;
    const completedAt = ((ref1 = item.completed_at) === null || ref1 === void 0 ? void 0 : ref1.N) ? +item.completed_at.N : null;
    const duration = completedAt && startedAt ? completedAt - startedAt : startedAt ? Date.now() - startedAt : null;
    return {
        branchId: (ref2 = item.branch_id) === null || ref2 === void 0 ? void 0 : ref2.S,
        completedAt: completedAt ? new Date(completedAt) : undefined,
        duration,
        id: item.id.S,
        outcome: (ref3 = item.outcome) === null || ref3 === void 0 ? void 0 : ref3.S,
        projectId: item.project_id.S,
        queuedAt: new Date(Number(item.created_at.N)),
        startedAt: startedAt ? new Date(startedAt) : undefined
    };
}
async function cancelEarlierDeploys(deploy) {
    const { Items: deploys  } = await dynamoDB.executeStatement({
        Statement: "UPDATE deploys SET completed_at = ?, outcome = ?  WHERE deploy_id != ? AND branch_id = ? AND project_id = ? AND started_at IS NULL",
        Parameters: [
            {
                N: String(Date.now())
            },
            {
                S: "cancelled"
            },
            {
                S: deploy.id
            },
            {
                S: deploy.branchId
            },
            {
                S: deploy.projectId
            }, 
        ]
    });
    await Promise.all(deploys.map(async (item)=>await (0, _storage).deleteS3Archive(item.id.S)
    ));
}
async function countActiveDeploys(projectId) {
    const { Items: active  } = await dynamoDB.executeStatement({
        Statement: "SELECT * FROM deploys WHERE project_id = ? AND started_at IS NOT NULL AND completed_at IS NULL",
        Parameters: [
            {
                S: projectId
            }
        ]
    });
    return active.length;
}
async function markDeployStarted(deployId) {
    await dynamoDB.executeStatement({
        Statement: "UPDATE deploys SET started_at = ? WHERE id = ?",
        Parameters: [
            {
                N: String(Date.now)
            },
            {
                S: deployId
            }
        ]
    });
}
async function markDeployCompleted(deployId, status) {
    await dynamoDB.executeStatement({
        Statement: "UPDATE deploys SET completed_at = ?, status = ? WHERE id = ?",
        Parameters: [
            {
                N: String(Date.now())
            },
            {
                S: status
            },
            {
                S: deployId
            }
        ]
    });
    await (0, _storage).deleteS3Archive(deployId);
}
async function getNextWaitingDeploy(deploy) {
    var ref;
    const { Items: waiting  } = await dynamoDB.executeStatement({
        Statement: "SELECT * FROM deploys WHERE branch_id = ? AND project_id = ? AND started_at IS NULL AND completed_at IS NULL ORDER BY created_at ASC",
        Parameters: [
            {
                S: deploy.branchId
            },
            {
                S: deploy.projectId
            }
        ]
    });
    return (ref = waiting[0]) === null || ref === void 0 ? void 0 : ref.id.S;
}
