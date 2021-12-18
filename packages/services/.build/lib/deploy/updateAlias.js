"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = updateAlias;
var _clientLambda = require("@aws-sdk/client-lambda");
var _tinyInvariant = _interopRequireDefault(require("tiny-invariant"));
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function updateAlias({ aliasARN , versionARN  }) {
    var ref;
    const [lambdaName, alias] = aliasARN.match(/([^:]+):([^:]+)$/).slice(1);
    const version = (ref = versionARN.match(/\d+$/)) === null || ref === void 0 ? void 0 : ref[0];
    (0, _tinyInvariant).default(alias && lambdaName);
    const lambda = new _clientLambda.Lambda({
    });
    try {
        const { AliasArn: arn  } = await lambda.getAlias({
            FunctionName: lambdaName,
            Name: alias
        });
        if (arn) {
            (0, _tinyInvariant).default(version);
            const { AliasArn: arn  } = await lambda.updateAlias({
                FunctionName: lambdaName,
                FunctionVersion: version,
                Name: alias
            });
            if (!arn) throw new Error("Could not update alias");
            return arn;
        }
    } catch (error) {
        if (!(error instanceof Error && error.name === "ResourceNotFoundException")) throw error;
    }
    const { AliasArn: arn  } = await lambda.createAlias({
        FunctionName: lambdaName,
        FunctionVersion: version,
        Name: alias
    });
    if (!arn) throw new Error("Could not create alias");
    return arn;
}
