"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = updateAlias;
var _clientLambda = require("@aws-sdk/client-lambda");
async function updateAlias({ alias , lambdaName , region , version  }) {
    const lambda = new _clientLambda.Lambda({
        region
    });
    try {
        const { AliasArn: arn  } = await lambda.getAlias({
            FunctionName: lambdaName,
            Name: alias
        });
        if (arn) {
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
