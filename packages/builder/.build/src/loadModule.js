"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = loadModule;
var swc = require("@swc/core");
var fs = require("fs");
var path1 = require("path");
var _sourceMapSupport = require("source-map-support");
var _vm = require("vm");
const globalRequire = require;
const sourceMaps1 = new Map();
_sourceMapSupport.default.install({
    environment: "node",
    retrieveSourceMap: (filename)=>{
        const map = sourceMaps1.get(filename);
        return map ? {
            url: filename,
            map
        } : null;
    }
});
function loadModule({ cache , envVars , filename: filename1 , parent  }) {
    const require = (id1)=>{
        if (id1.startsWith(".")) {
            const child = cache[id1] ?? loadModule({
                cache,
                envVars,
                filename: require.resolve(id1),
                parent: module1
            });
            if (!module1.children.find(({ id  })=>id === child.id
            )) module1.children.push(child);
            return child.exports;
        } else {
            const fromNodeModule = requireFromNodeModules(filename1, require.resolve.paths(filename1));
            if (fromNodeModule) return fromNodeModule;
            else return globalRequire(id1);
        }
    };
    require.cache = cache;
    require.main = undefined;
    require.extensions = {
        ...globalRequire.extensions,
        ".json": (module, filename)=>{
            module.exports.default = JSON.parse(fs.readFileSync(require.resolve(filename), "utf8"));
        },
        ".js": compileSourceFile({
            envVars,
            sourceMaps: sourceMaps1,
            syntax: "ecmascript"
        }),
        ".ts": compileSourceFile({
            envVars,
            sourceMaps: sourceMaps1,
            syntax: "typescript"
        })
    };
    const resolve = (id)=>{
        const fullPath = path1.resolve(path1.dirname(module1.filename), id);
        const found = [
            ".ts",
            "/index.ts",
            ".js",
            "/index.js",
            ".json",
            ""
        ].map((ext)=>`${fullPath}${ext}`
        ).find((path)=>fs.existsSync(path)
        );
        return found ?? globalRequire.resolve(id);
    };
    resolve.paths = (id)=>nodeModulePaths(id)
    ;
    require.resolve = resolve;
    const module1 = {
        children: [],
        exports: {
        },
        filename: filename1,
        id: filename1,
        isPreloading: false,
        loaded: false,
        parent,
        path: path1.dirname(filename1),
        paths: ((parent === null || parent === void 0 ? void 0 : parent.paths) ?? globalRequire.resolve.paths("")) ?? [],
        require
    };
    cache[filename1] = module1;
    const extension = require.extensions[path1.extname(filename1)];
    if (extension) extension(module1, filename1);
    module1.loaded = true;
    return module1;
}
function requireFromNodeModules(filename, paths) {
    if (!paths) return null;
    const found = paths.map((dir)=>path1.resolve(dir, filename)
    ).find((path)=>fs.existsSync(path)
    );
    return found ? require(found) : null;
}
function nodeModulePaths(filename) {
    if (filename.startsWith(".")) return null;
    const dirname = path1.dirname(filename);
    const paths = [];
    if (fs.existsSync(path1.resolve(dirname, "package.json"))) paths.push(path1.resolve(dirname, "node_modules"));
    if (dirname === "/" || dirname === process.cwd()) return paths;
    const parent = nodeModulePaths(path1.dirname(dirname));
    return parent ? [
        ...parent,
        ...paths
    ] : paths;
}
function compileSourceFile({ envVars , sourceMaps , syntax  }) {
    return (module, filename)=>{
        const { code , map: sourceMap  } = swc.transformFileSync(filename, {
            envName: process.env.NODE_ENV,
            env: {
                targets: {
                    node: 14
                }
            },
            jsc: {
                parser: {
                    syntax
                },
                transform: {
                    optimizer: {
                        globals: {
                            vars: envVars
                        }
                    }
                }
            },
            sourceMaps: true,
            module: {
                type: "commonjs",
                noInterop: true
            }
        });
        if (sourceMap) sourceMaps.set(filename, sourceMap);
        _vm.default.compileFunction(code, [
            "exports",
            "require",
            "module",
            "__filename",
            "__dirname"
        ], {
            filename
        })(module.exports, module.require, module, filename, path1.dirname(filename));
        module.loaded = true;
    };
}
