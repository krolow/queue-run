"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = loadFunction;
var _chokidar = require("chokidar");
var _path = require("path");
var _loadModule = require("./loadModule");
function loadFunction({ envVars , filename , watch  }) {
    const paths = new Set();
    const exports = loadAndVerify({
        envVars,
        filename,
        paths
    });
    if (watch) {
        const watcher = _chokidar.default.watch(Array.from(paths), {
            ignoreInitial: true
        });
        watcher.on("change", (changed)=>{
            console.debug("File %s changed => reloading %s", _path.default.relative(process.cwd(), changed), _path.default.relative(process.cwd(), filename));
            try {
                Object.assign(exports, loadAndVerify({
                    envVars,
                    filename,
                    paths
                }));
            } catch (error) {
                console.error("Error loading %s", filename, error.stack);
            }
            watcher.add(Array.from(paths));
        });
    }
    return exports;
}
function loadAndVerify({ envVars , filename , paths  }) {
    const cache = {
    };
    try {
        const { exports  } = (0, _loadModule).default({
            envVars,
            filename,
            cache
        });
        const handler = exports.handler || exports.default;
        if (typeof handler !== "function") throw new Error(`Expected ${filename} to export a function (default)`);
        const config = exports.config || {
        };
        if (typeof config !== "object") throw new Error(`Expected ${filename} to export an object (config)`);
        return {
            config,
            handler
        };
    } finally{
        paths.clear();
        Object.keys(cache).forEach((path)=>paths.add(path)
        );
    }
}
