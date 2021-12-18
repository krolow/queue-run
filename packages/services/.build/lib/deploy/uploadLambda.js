"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = uploadLambda;
exports.deleteLambda = deleteLambda;
exports.handler = void 0;
var _clientLambda = require("@aws-sdk/client-lambda");
var _tinyInvariant = _interopRequireDefault(require("tiny-invariant"));
var _lambdaRole = require("./lambdaRole");
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
const handler = "node_modules/@queue-run/runtime/dist/index.handler";
exports.handler = handler;
async function uploadLambda({ envVars , lambdaName , lambdaTimeout , lambdaRuntime , zip  }) {
    const lambda = new _clientLambda.Lambda({
    });
    const configuration = {
        Environment: {
            Variables: aliasAWSEnvVars(envVars)
        },
        FunctionName: lambdaName,
        Handler: handler,
        Role: await (0, _lambdaRole).getLambdaRole({
            lambdaName
        }),
        Runtime: lambdaRuntime,
        Timeout: lambdaTimeout,
        TracingConfig: {
            Mode: "Active"
        }
    };
    const existing = await getFunction({
        lambda,
        lambdaName
    });
    if (existing) {
        // Change configuration first, here we determine runtime, and only then
        // load code and publish.
        const updatedConfig = await lambda.updateFunctionConfiguration({
            ...configuration,
            RevisionId: existing.RevisionId
        });
        (0, _tinyInvariant).default(updatedConfig.RevisionId);
        const { RevisionId: updatedConfigRevisionId  } = await waitForNewRevision({
            lambda,
            lambdaName,
            revisionId: updatedConfig.RevisionId
        });
        const updatedCode = await lambda.updateFunctionCode({
            FunctionName: lambdaName,
            Publish: true,
            ZipFile: zip,
            RevisionId: updatedConfigRevisionId
        });
        // FunctionArn includes version number
        (0, _tinyInvariant).default(updatedCode.FunctionArn && updatedCode.RevisionId);
        console.info("λ: Updated function %s", lambdaName);
        return updatedCode.FunctionArn;
    }
    const newLambda = await lambda.createFunction({
        ...configuration,
        Code: {
            ZipFile: zip
        },
        PackageType: "Zip",
        Publish: true
    });
    // FunctionArn does not include version number
    const arn = `${newLambda.FunctionArn}:${newLambda.Version}`;
    console.info("λ: Created new function %s in %s", lambdaName, await lambda.config.region());
    return arn;
}
async function getFunction({ lambda , lambdaName  }) {
    try {
        const { Configuration: existing  } = await lambda.getFunction({
            FunctionName: lambdaName
        });
        return existing !== null && existing !== void 0 ? existing : null;
    } catch (error) {
        if (error instanceof Error && error.name === "ResourceNotFoundException") return null;
        else throw error;
    }
}
async function waitForNewRevision({ lambda , lambdaName , revisionId  }) {
    const { Configuration  } = await lambda.getFunction({
        FunctionName: lambdaName
    });
    if (!(Configuration === null || Configuration === void 0 ? void 0 : Configuration.RevisionId)) throw new Error("Could not get function configuration");
    if (Configuration.RevisionId === revisionId) {
        await new Promise((resolve)=>setTimeout(resolve, 500)
        );
        return await waitForNewRevision({
            lambda,
            lambdaName,
            revisionId
        });
    } else {
        return Configuration;
    }
}
function aliasAWSEnvVars(envVars) {
    const aliasPrefix = "ALIASED_FOR_CLIENT__";
    const aliased = {
    };
    for (const [key, value] of Object.entries(envVars)){
        if (key.startsWith("AWS_")) aliased[`${aliasPrefix}${key}`] = value;
        else aliased[key] = value;
    }
    return aliased;
}
async function deleteLambda({ lambdaName  }) {
    const lambda = new _clientLambda.Lambda({
    });
    await lambda.deleteFunction({
        FunctionName: lambdaName
    });
    await (0, _lambdaRole).deleteLambdaRole({
        lambdaName
    });
}
