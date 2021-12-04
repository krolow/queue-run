"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = createBuildDirectory;
var _promises = require("fs/promises");
var _rimraf = require("rimraf");
async function createBuildDirectory(targetDir) {
    _rimraf.default.sync(targetDir);
    await (0, _promises).mkdir(targetDir);
}
