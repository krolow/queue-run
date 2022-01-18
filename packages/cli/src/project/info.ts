import { Command } from "commander";
import filesize from "filesize";
import { getAPIGatewayURLs, getRecentVersions } from "queue-run-builder";
import { loadProject } from "./project.js";

const command = new Command("info")
  .description("info about your project")
  .action(async () => {
    const { name, runtime } = await loadProject();

    console.info("Name:\t\t%s", name);
    console.info("Runtime:\t%s", runtime);

    const versions = await getRecentVersions(name);
    const current = versions.find(({ isCurrent }) => isCurrent);
    if (!current) throw new Error("No current version");

    console.info("Version:\t%s", current.version);
    console.info("Deployed:\t%s", current.modified.toLocaleString());
    console.info("Size:\t\t%s", filesize(current.size));

    const { httpURL, wsURL } = await getAPIGatewayURLs(name);
    console.info("API:\t\t%s", httpURL);
    console.info("WebSocket:\t%s", wsURL);
  });

export default command;
