"use strict";
Object.defineProperty(exports, "__esModule", {
  value: true,
});
exports.handler = exports.buildDir = exports.lambdaRolePath = void 0;
var _path = require("path");
const lambdaRolePath = "/queue.run/";
exports.lambdaRolePath = lambdaRolePath;
const buildDir = _path.default.resolve(".build");
exports.buildDir = buildDir;
const handler = "node_modules/@queue.run/runtime/dist/index.handler";
exports.handler = handler;
