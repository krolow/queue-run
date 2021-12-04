"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.createQueues = createQueues;
exports.deleteOldQueues = deleteOldQueues;
var _clientSqs = require("@aws-sdk/client-sqs");
var _util = require("./util");
async function createQueues({ configs , prefix , region  }) {
    const sqs = new _clientSqs.SQS({
        region
    });
    return await Promise.all(Array.from(configs.entries()).map(async ([name, { config  }])=>{
        const fifo = (config === null || config === void 0 ? void 0 : config.fifo) ? ".fifo" : "";
        const { QueueUrl  } = await sqs.createQueue({
            QueueName: `${prefix}${name}${fifo}`
        });
        if (!QueueUrl) throw new Error(`Could not create queue ${name}`);
        const arn = (0, _util).queueURLToARN(QueueUrl);
        console.info("\xb5: Created queue %s", name);
        return arn;
    }));
}
async function deleteOldQueues({ prefix , queueArns , region  }) {
    const sqs = new _clientSqs.SQS({
        region
    });
    const { QueueUrls  } = await sqs.listQueues({
        QueueNamePrefix: prefix
    });
    if (!QueueUrls) return;
    const set = new Set(queueArns);
    const toDelete = QueueUrls.filter((QueueUrl)=>!set.has((0, _util).queueURLToARN(QueueUrl))
    );
    if (toDelete.length === 0) return;
    console.info("\xb5: Deleting old queues %s …", toDelete.map(_util.queueURLToName).join(", "));
    await Promise.all(toDelete.map(async (QueueUrl)=>sqs.deleteQueue({
            QueueUrl
        })
    ));
}
