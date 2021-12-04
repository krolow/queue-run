"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = installDependencies;
var _childProcess = require("child_process");
var _ms = require("ms");
async function installDependencies(dirname) {
    await yarn({
        dirname,
        args: [
            "install",
            "--production"
        ]
    });
    await yarn({
        dirname,
        args: [
            "link",
            "@assaf/untitled-runtime"
        ]
    });
}
async function yarn({ dirname , args  }) {
    const install = await (0, _childProcess).spawn("yarn", args, {
        cwd: dirname,
        env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            TMPDIR: process.env.TMPDIR
        },
        stdio: "inherit",
        timeout: (0, _ms).default("30s")
    });
    await new Promise((resolve, reject)=>{
        install.on("error", reject);
        install.on("exit", resolve);
    });
}
