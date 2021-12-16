"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = void 0;
var _commander = require("commander");
var _devServer = require("./devServer");
var _pushMessage = require("./pushMessage");
const command = new _commander.Command("dev");
var _default = command;
exports.default = _default;
const port = new _commander.Option("-p, --port <port>", "Port to run the server on").env("PORT").default(8001).makeOptionMandatory();
command.command("start", {
    isDefault: true
}).description("Start the development server (default command)").addOption(port).action(_devServer.default);
command.command("queue").description("Push message to the named queue (dev server)").argument("<queueName>", "The queue name").argument("<message>", 'The message; use @name to read from a file, or "-" to read from stdin').addOption(port).option("-g --group <group>", "Group ID (FIFO queues only)").action(_pushMessage.default);
command.command("schedule", {
    hidden: true
}).description("Run a scheduled job (dev server)").argument("<jobName>", "The scheduled job name").addOption(port).action(async (jobName, options)=>{
    console.log("run job", jobName, options);
});
