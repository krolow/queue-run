"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = compileSourceFiles;
var swc = require("@swc/core");
var _fastGlob = require("fast-glob");
var _promises = require("fs/promises");
var _path = require("path");
async function compileSourceFiles({ envVars , sourceDir , targetDir  }) {
    console.info("λ: Building %s", targetDir);
    const ignore = (await (0, _promises).readFile(_path.default.join(sourceDir, ".gitignore"), "utf-8").catch(()=>""
    )).split("\n").filter((line)=>line.trim().length > 0 && !line.startsWith("#")
    );
    const filenames = _fastGlob.default.sync("**/*", {
        cwd: sourceDir,
        followSymbolicLinks: true,
        ignore: [
            ...ignore,
            "**/node_modules/**"
        ],
        markDirectories: true,
        unique: true
    });
    for (const filename of filenames){
        const dest = _path.default.join(targetDir, _path.default.relative(sourceDir, filename));
        if (filename.endsWith("/")) await (0, _promises).mkdir(dest, {
            recursive: true
        });
        else {
            await (0, _promises).mkdir(_path.default.dirname(dest), {
                recursive: true
            });
            if (filename.endsWith(".ts")) await compileTypeScript({
                filename,
                dest,
                envVars
            });
            else await (0, _promises).copyFile(filename, dest);
        }
    }
}
async function compileTypeScript({ dest , envVars , filename  }) {
    const { code , map  } = await swc.transformFile(filename, {
        envName: process.env.NODE_ENV,
        env: {
            targets: {
                node: 14
            }
        },
        jsc: {
            parser: {
                syntax: "typescript"
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
    await (0, _promises).writeFile(dest.replace(/\.ts$/, ".js"), code, "utf-8");
    if (map) await (0, _promises).writeFile(dest.replace(/\.ts$/, ".js.map"), map, "utf-8");
}
