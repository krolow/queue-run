"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = createZip;
var _fastGlob = require("fast-glob");
var _filesize = require("filesize");
var _promises = require("fs/promises");
var _jszip = require("jszip");
var _ms = require("ms");
var _path = require("path");
async function createZip(dirname2) {
    const start = Date.now();
    console.info("λ: Zipping %s", dirname2);
    const zip = new _jszip.default();
    const filenames = _fastGlob.default.sync("**/*", {
        cwd: dirname2,
        dot: true,
        followSymbolicLinks: true,
        onlyFiles: true
    });
    await Promise.all(filenames.map(async (filename)=>{
        const filepath = _path.default.resolve(dirname2, filename);
        const stat = await (0, _promises).lstat(filepath);
        if (!(stat.isDirectory() || stat.isSymbolicLink())) zip.file(filename, await (0, _promises).readFile(filepath));
    }));
    const buffer = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: {
            level: 9
        }
    });
    console.info("λ: Zipped %s", (0, _filesize).default(buffer.byteLength));
    const folders = new Map();
    await Promise.all(Object.values(zip.files).map(async (entry)=>{
        const dirname = _path.default.dirname(entry.name);
        const folder = summaryFolderName(dirname);
        const { byteLength  } = await entry.async("uint8array");
        folders.set(folder, (folders.get(folder) ?? 0) + byteLength);
    }));
    for (const [dirname1, size] of folders)if (size > 0) console.info("   %s   %s", truncated(dirname1), (0, _filesize).default(size));
    console.info("✨  Done in %s.", (0, _ms).default(Date.now() - start));
    return buffer;
}
function summaryFolderName(dirname) {
    if (dirname === ".") return "/";
    if (dirname.startsWith("node_modules/")) {
        var ref;
        const parts = dirname.split("/");
        return parts.slice(0, ((ref = parts[1]) === null || ref === void 0 ? void 0 : ref.startsWith("@")) ? 3 : 2).join("/");
    } else return dirname;
}
function truncated(dirname) {
    if (dirname.length < 40) return dirname.padEnd(40);
    if (dirname.length > 40) return dirname.replace(/^(.{19}).*(.{20})$/, "$1…$2");
    return dirname;
}
