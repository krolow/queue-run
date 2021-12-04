"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.handler = exports.buildDir = exports.lambdaRolePath = void 0;
var _path = require("path");
const lambdaRolePath = "/untitled/";
exports.lambdaRolePath = lambdaRolePath;
const buildDir = _path.default.resolve(".build");
exports.buildDir = buildDir;
const handler = "node_modules/@assaf/untitled-runtime/dist/index.handler";
exports.handler = handler;
