"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.addTriggers = addTriggers;
exports.removeTriggers = removeTriggers;
var _clientLambda = require("@aws-sdk/client-lambda");
async function addTriggers({ lambdaName , region , sourceArns  }) {
    const lambda = new _clientLambda.Lambda({
        region
    });
    if (sourceArns.length === 0) return;
    const { EventSourceMappings  } = await lambda.listEventSourceMappings({
        FunctionName: lambdaName
    });
    const arnToUUID = new Map(EventSourceMappings === null || EventSourceMappings === void 0 ? void 0 : EventSourceMappings.map(({ EventSourceArn , UUID  })=>[
            EventSourceArn,
            UUID
        ]
    ));
    const created = await Promise.all(sourceArns.map(async (arn)=>{
        const uuid = arnToUUID.get(arn);
        if (uuid) {
            await lambda.updateEventSourceMapping({
                UUID: uuid,
                FunctionName: lambdaName
            });
            return false;
        } else {
            const { UUID  } = await lambda.createEventSourceMapping({
                Enabled: true,
                FunctionName: lambdaName,
                EventSourceArn: arn
            });
            if (!UUID) throw new Error(`Could not create event source for ${arn}`);
            return true;
        }
    }));
    if (created.some(Boolean)) console.info("λ: Added new triggers");
}
async function removeTriggers({ lambdaName , region , sourceArns  }) {
    const lambda = new _clientLambda.Lambda({
        region
    });
    const { EventSourceMappings  } = await lambda.listEventSourceMappings({
        FunctionName: lambdaName
    });
    if (!EventSourceMappings) return;
    const set = new Set(sourceArns);
    const removing = EventSourceMappings.filter(({ EventSourceArn  })=>EventSourceArn && !set.has(EventSourceArn)
    );
    if (removing.length === 0) return;
    await Promise.all(removing.map(({ UUID  })=>lambda.deleteEventSourceMapping({
            UUID
        })
    ));
    console.info("λ: Removed old triggers");
}
