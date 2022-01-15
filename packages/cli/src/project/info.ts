import { Command } from "commander";
import { getAPIGatewayURLs } from "queue-run-builder";
import { loadProject } from "./project.js";

const command = new Command("info")
  .description("info about your project")
  .action(async () => {
    const { name, runtime } = await loadProject();
    if (!(name && runtime))
      throw new Error(
        "You need to setup your project first: npx queue-run init"
      );

    console.info("Name:\t\t%s", name);
    console.info("Runtime:\t%s", runtime);

    const { httpURL, wsURL } = await getAPIGatewayURLs(name);
    console.info("API:\t\t%s", httpURL);
    console.info("WebSocket:\t%s", wsURL);
  });

export default command;
