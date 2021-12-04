"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.queueURLToARN = queueURLToARN;
exports.queueURLToName = queueURLToName;
var _url = require("url");
function queueURLToARN(queueURL) {
    var ref;
    // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
    const { hostname , pathname  } = new _url.URL(queueURL);
    const region = (ref = hostname.match(/^sqs\.(.+?)\.amazonaws\.com/)) === null || ref === void 0 ? void 0 : ref[1];
    const [accountId, name] = pathname.split("/").slice(1);
    return `arn:aws:sqs:${region}:${accountId}:${name}`;
}
function queueURLToName(queueURL) {
    // Looks like https://sqs.{region}.amazonaws.com/{accountId}/{queueName}
    const { pathname  } = new _url.URL(queueURL);
    return pathname.split("/")[2];
}
