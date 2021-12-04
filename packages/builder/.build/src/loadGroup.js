"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = loadGroup;
var _fastGlob = require("fast-glob");
var _path = require("path");
var _loadFunction = require("./loadFunction");
function loadGroup({ dirname , envVars , group , watch  }) {
    const filenames = listFilenames(_path.default.resolve(dirname, "background", group));
    return filenames.reduce((map, filename)=>map.set(_path.default.basename(filename, _path.default.extname(filename)), (0, _loadFunction).default({
            envVars,
            filename,
            watch
        }))
    , new Map());
}
function isValidFunctionName(filename) {
    const basename = _path.default.basename(filename, _path.default.extname(filename));
    return /^[a-zA-Z0-9_-]+$/.test(basename);
}
function listFilenames(dirname) {
    const filenames = _fastGlob.default.sync("[!_]*.{js,ts}", {
        cwd: dirname,
        followSymbolicLinks: true,
        onlyFiles: true
    });
    const invalid = filenames.filter((filename)=>!isValidFunctionName(filename)
    );
    if (invalid.length > 0) {
        const filenames = invalid.map((filename)=>`'${filename}''`
        ).join(", ");
        throw new Error(`Filename can only contain alphanumeric, hyphen, or underscore: ${filenames}`);
    }
    return filenames.map((filename)=>_path.default.resolve(dirname, filename)
    );
}
