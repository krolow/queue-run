"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "deploy", {
    enumerable: true,
    get: function() {
        return _deploy.default;
    }
});
var _commander = require("commander");
var _fs = require("fs");
var _path = require("path");
var _constants = require("./constants");
var _fullBuild = require("./fullBuild");
var _loadEnvVars = require("./loadEnvVars");
var _deploy = require("./deploy");
const program = new _commander.Command();
program.version(JSON.parse((0, _fs).readFileSync(_path.default.join(__dirname, "..", "package.json"), "utf-8")).version);
program.command("build").description("Build the project").action(async ()=>{
    const sourceDir = process.cwd();
    const envVars = await (0, _loadEnvVars).default(sourceDir);
    await (0, _fullBuild).default({
        buildDir: _constants.buildDir,
        envVars,
        install: false,
        sourceDir
    });
});
program.action(()=>console.log("OK")
);
program.parse(process.argv);
