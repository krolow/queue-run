import { Command } from "commander";
import { initProject } from "./deploy/project";
import copyTemplates from "./deploy/templates";

const command = new Command("init")
  .description("Setup a new project in the current directory")
  .action(async () => {
    const { language } = await initProject();
    await copyTemplates(language);
  });

export default command;
