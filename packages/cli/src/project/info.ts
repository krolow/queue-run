import { Command } from "commander";
import filesize from "filesize";
import { getAPIGatewayURLs, getRecentVersions } from "queue-run-builder";
import { loadProject } from "./project.js";

const command = new Command("info")
  .description("info about your project")
  .action(async () => {
    const { name, region, runtime } = await loadProject();

    console.info("Name:\t\t%s", name);
    console.info("Region:\t\t%s", region);
    console.info("Runtime:\t%s", runtime);

    const versions = await getRecentVersions({ region, slug: name });
    const current = versions.find(({ isCurrent }) => isCurrent);
    if (!current) throw new Error("No current version");

    console.info("Version:\t%s", current.version);
    console.info("Deployed:\t%s", current.modified.toLocaleString());
    console.info("Size:\t\t%s", filesize(current.size));

    const { httpUrl, wsUrl } = await getAPIGatewayURLs({
      project: name,
      region,
    });
    console.info("API:\t\t%s", httpUrl);
    console.info("WebSocket:\t%s", wsUrl);
  });

export default command;
