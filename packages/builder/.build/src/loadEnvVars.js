"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = loadEnvVars;
var _dotenv = require("dotenv");
var _promises = require("fs/promises");
var _path = require("path");
async function loadEnvVars(dirname) {
    const dotEnv = await (0, _promises).readFile(_path.default.resolve(dirname, ".env"), "utf8").catch(()=>""
    );
    const envVars = _dotenv.default.parse(dotEnv);
    return {
        ...envVars,
        NODE_ENV: (envVars.NODE_ENV ?? process.env.NODE_ENV) ?? "development"
    };
}
