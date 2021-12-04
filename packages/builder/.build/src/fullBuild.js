"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = fullBuild;
var _fs = require("fs");
var _promises = require("fs/promises");
var _ms = require("ms");
var _path = require("path");
var _compileSourceFiles = require("./compileSourceFiles");
var _createBuildDirectory = require("./createBuildDirectory");
var _installDependencies = require("./installDependencies");
async function fullBuild({ buildDir , envVars , install , sourceDir  }) {
    await (0, _createBuildDirectory).default(buildDir);
    if (install) {
        await copyPackageJSON(sourceDir, buildDir);
        await (0, _installDependencies).default(buildDir);
        console.info();
    }
    const start = Date.now();
    await (0, _compileSourceFiles).default({
        sourceDir,
        targetDir: buildDir,
        envVars
    });
    console.info("✨  Done in %s.", (0, _ms).default(Date.now() - start));
}
async function copyPackageJSON(sourceDir, targetDir) {
    const source = _path.default.resolve(sourceDir, "package.json");
    const dest = _path.default.resolve(targetDir, "package.json");
    if (!(0, _fs).existsSync(source)) throw new Error("Missing package.json");
    await (0, _promises).copyFile(source, dest);
}
