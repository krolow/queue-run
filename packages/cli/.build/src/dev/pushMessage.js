"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = pushMessage;
var _promises = require("fs/promises");
var _nodeFetch = require("node-fetch");
var _url = require("url");
async function pushMessage(queueName, message, { port , group  }) {
    const body = await getMessageBody(message);
    const path = queueName.endsWith(".fifo") ? `/queue/${queueName}/${group !== null && group !== void 0 ? group : "group-x"}` : `/queue/${queueName}`;
    const url = new _url.URL(path, `http://localhost:${port}`);
    const response = await (0, _nodeFetch).default(url.href, {
        method: "POST",
        body
    });
    if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
    const { messageId  } = await response.json();
    console.info("Queued message %s", messageId);
}
async function getMessageBody(message) {
    if (message === "-") return await (0, _promises).readFile("/dev/stdin", "utf8");
    else if (message.startsWith("@")) return await (0, _promises).readFile(message.slice(1), "utf-8");
    else return message;
}
