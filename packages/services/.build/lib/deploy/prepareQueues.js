"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.createQueues = createQueues;
exports.deleteOldQueues = deleteOldQueues;
var _clientSqs = require("@aws-sdk/client-sqs");
var _url = require("url");
async function createQueues({ prefix , queues , queueTimeout  }) {
    const sqs = new _clientSqs.SQS({
    });
    return await Promise.all(queues.map(async (name)=>{
        // createQueue is idempotent so we can safely call it on each deploy.
        // However, createQueue fails if the queue already exists, but with
        // different attributes, so we split createQueue and setQueueAttributes
        // into two separate calls.
        const isFifo = name.endsWith(".fifo");
        const { QueueUrl: queueURL  } = await sqs.createQueue({
            QueueName: `${prefix}${name}`,
            Attributes: {
                ...isFifo ? {
                    ContentBasedDeduplication: "true",
                    DeduplicationScope: "messageGroupId",
                    FifoQueue: "true",
                    FifoThroughputLimit: "perMessageGroupId"
                } : undefined
            }
        });
        if (!queueURL) throw new Error(`Could not create queue ${name}`);
        await sqs.setQueueAttributes({
            QueueUrl: queueURL,
            Attributes: {
                VisibilityTimeout: queueTimeout.toFixed(0)
            }
        });
        return arnFromQueueURL(queueURL);
    }));
}
async function deleteOldQueues({ prefix , queueARNs  }) {
    const sqs = new _clientSqs.SQS({
    });
    const { QueueUrls: queueURLs  } = await sqs.listQueues({
        QueueNamePrefix: prefix
    });
    if (!queueURLs) return;
    const set = new Set(queueARNs);
    const toDelete = queueURLs.filter((url)=>!set.has(arnFromQueueURL(url))
    );
    await Promise.all(toDelete.map(async (url)=>{
        console.info("µ: Deleting old queue %s", nameFromQueueURL(url));
        await sqs.deleteQueue({
            QueueUrl: url
        });
    }));
}
function arnFromQueueURL(queueURL) {
    var ref;
    // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
    const { hostname , pathname  } = new _url.URL(queueURL);
    const region = (ref = hostname.match(/^sqs\.(.+?)\.amazonaws\.com/)) === null || ref === void 0 ? void 0 : ref[1];
    const [accountId, name] = pathname.split("/").slice(1);
    return `arn:aws:sqs:${region}:${accountId}:${name}`;
}
function nameFromQueueURL(queueURL) {
    // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
    const { pathname  } = new _url.URL(queueURL);
    return pathname.split("/")[2];
}
