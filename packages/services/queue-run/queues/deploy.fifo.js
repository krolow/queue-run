"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = deployJob;
exports.config = void 0;
var _builder = require("@queue-run/builder");
var _inSequence = require("../lib/deploy/inSequence");
var _withSourceDir = _interopRequireDefault(require("../lib/deploy/withSourceDir"));
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function deployJob({ deployId  }, { params , signal: signal1  }) {
    console.log({
        params
    });
    await (0, _inSequence).deployInSequence({
        deployId,
        signal: signal1
    }, async ({ archive , deploy , signal  })=>(0, _withSourceDir).default({
            archive,
            signal
        }, async (sourceDir)=>await (0, _builder).deployProject({
                config: {
                    project: deploy.projectId,
                    branch: deploy.branchId
                },
                signal,
                sourceDir
            })
        )
    );
}
const config = {
    url: "/project/:group/deploy/",
    accepts: "application/json"
};
exports.config = config;
