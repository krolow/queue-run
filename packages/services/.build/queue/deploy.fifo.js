"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = deployJob;
var _deployProject = _interopRequireDefault(require("../lib/deploy/deployProject"));
var _inSequence = require("../lib/deploy/inSequence");
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function deployJob({ deployId  }, { signal: signal1  }) {
    await (0, _inSequence).deployInSequence({
        deployId,
        signal: signal1
    }, async ({ archive , deploy , signal  })=>{
        (0, _deployProject).default({
            archive,
            deploy,
            signal
        });
    });
}
