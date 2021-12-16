"use strict";
var _builder = require("@queue-run/builder");
var _commander = require("commander");
var _ms = require("ms");
var _dev = require("./dev");
const pkg = require("../package.json");
const program = new _commander.Command();
program.version(pkg.version);
program.addCommand(_dev.default);
program.command("build").description("Build the backend").option("-o, --output <dir>", "Output directory", ".build").action(async ()=>{
    const sourceDir = process.cwd();
    await (0, _builder).buildProject({
        install: false,
        sourceDir
    });
});
program.showSuggestionAfterError();
program.addHelpCommand();
program.configureHelp({
    sortSubcommands: true,
    sortOptions: true
});
program.parseAsync(process.argv).then(()=>{
    if (process.stdout.isTTY) console.info("🌟 Done in %s", (0, _ms).default(process.uptime() * 1000));
    return undefined;
}).catch((error)=>{
    console.error(String(error));
    process.exit(1);
});
