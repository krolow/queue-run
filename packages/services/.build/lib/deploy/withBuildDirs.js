"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.default = withBuildDirs;
var _promises = _interopRequireDefault(require("fs/promises"));
var _jszip = _interopRequireDefault(require("jszip"));
var _path = _interopRequireDefault(require("path"));
function _interopRequireDefault(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function withBuildDirs({ archive , signal  }, buildFn) {
    const sourceDir = await _promises.default.mkdtemp("/tmp/source");
    const targetDir = await _promises.default.mkdtemp("/tmp/target");
    try {
        await explodeZip(archive, sourceDir);
        if (signal.aborted) throw new Error();
        return await buildFn({
            sourceDir,
            targetDir
        });
    } finally{
        await Promise.all([
            _promises.default.rm(sourceDir, {
                force: true,
                recursive: true
            }),
            _promises.default.rm(targetDir, {
                force: true,
                recursive: true
            }), 
        ]);
    }
}
async function explodeZip(archive, targetDir) {
    const zip = new _jszip.default();
    await zip.loadAsync(archive);
    await Promise.all(Object.entries(zip.files).map(async ([filename, file])=>{
        const realpath = _path.default.resolve(targetDir, filename);
        if (file.dir) await _promises.default.mkdir(realpath, {
            recursive: true
        });
        else {
            await _promises.default.mkdir(_path.default.dirname(realpath), {
                recursive: true
            });
            await _promises.default.writeFile(realpath, await file.async("nodebuffer"));
        }
    }));
}
