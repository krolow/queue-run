"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.deleteS3Archive = deleteS3Archive;
exports.readS3Archive = readS3Archive;
var _clientS3 = require("@aws-sdk/client-s3");
const s3 = new _clientS3.S3({
});
const s3Bucket = "queuerun-deploy-upload";
async function deleteS3Archive(deployId) {
    await s3.deleteObject(objectKey(deployId));
}
async function readS3Archive(deployId) {
    const { Body  } = await s3.getObject(objectKey(deployId));
    const stream = Body;
    const chunks = [];
    for await (const chunk of stream)chunks.push(chunk);
    return Buffer.concat(chunks);
}
function objectKey(deployId) {
    return {
        Bucket: s3Bucket,
        Key: deployId.match(/^(.{4})(.*)$/).slice(1).join("/")
    };
}
