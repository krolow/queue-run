"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = devServer;
var _builder = require("@queue-run/builder");
var _runtime = require("@queue-run/runtime");
var _crypto = require("crypto");
var _http = require("http");
var _url = require("url");
async function devServer({ port  }) {
    const server = (0, _http).createServer(async function(req, res) {
        var ref;
        var ref1;
        const method = (ref1 = (ref = req.method) === null || ref === void 0 ? void 0 : ref.toLocaleUpperCase()) !== null && ref1 !== void 0 ? ref1 : "GET";
        const headers = Object.fromEntries(Object.entries(req.headers).map(([name, value])=>[
                name,
                String(value)
            ]
        ));
        var _url1;
        const url = new _url.URL((_url1 = req.url) !== null && _url1 !== void 0 ? _url1 : "/", `http://${headers.host}`);
        let data = [];
        for await (const chunk of req)data.push(chunk);
        const body = Buffer.concat(data).toString("base64");
        const lambdaEvent = {
            method,
            url: url.href,
            headers,
            body
        };
        const functionName = headers.host.split(":")[0];
        const timeout = Date.now() + 10 * 1000;
        const lambdaContext = {
            awsRequestId: _crypto.default.randomBytes(8).toString("hex"),
            callbackWaitsForEmptyEventLoop: false,
            functionName,
            functionVersion: "0",
            getRemainingTimeInMillis: ()=>timeout - Date.now()
            ,
            invokedFunctionArn: `arn:aws:lambda:localhost:12345:function:${functionName}:${functionName}-dev`,
            logGroupName: functionName,
            memoryLimitInMB: "1024"
        };
        const response = await (0, _runtime).handler(lambdaEvent, lambdaContext);
        if (response) {
            console.info("%s %s => %s", method, req.url, response.statusCode);
            res.writeHead(response.statusCode, response.headers);
            res.end(Buffer.from(response.body, "base64"));
        } else {
            console.info("%s => 500", req.url);
            res.writeHead(500).end("Internal Server Error");
        }
    });
    await (0, _builder).moduleLoader({
        dirname: process.cwd(),
        watch: true
    });
    server.listen(port, ()=>{
        console.info("👋 Dev server listening on http://localhost:%d", port);
    });
    await new Promise((resolve, reject)=>server.on("close", resolve).on("error", reject)
    );
}
