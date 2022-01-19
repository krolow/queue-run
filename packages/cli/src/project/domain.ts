import { ApiGatewayV2 } from "@aws-sdk/client-apigatewayv2";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import {
  addAPIGatewayDomain,
  discardCertificateRequest,
  getAPIGatewayIds,
  removeAPIGatewayDomain,
  requestCertificate,
} from "queue-run-builder";
import invariant from "tiny-invariant";
import { loadProject } from "./project.js";

const command = new Command("domain");
const apiGateway = new ApiGatewayV2({});

command
  .command("add")
  .description("add custom domain")
  .argument("<domain>", "domain name, eg example.com")
  .option("--method [email|dns]", "verification method")
  .option("--verify [verify]", "email verification domain")
  .action(
    async (
      domain: string,
      {
        method,
        verifyDomain,
      }: {
        method?: "email" | "dns";
        verifyDomain?: string;
      }
    ) => {
      const { name } = await loadProject();
      const { httpApiId, wsApiId } = await getAPIGatewayIds(name);
      if (!(httpApiId && wsApiId))
        throw new Error('Project not deployed: run "npx queue-run deploy"');

      const wildcard = domain.startsWith("*.") ? domain : `*.${domain}`;
      const certificateArn = await requestCertificate({
        domain: wildcard,
        method,
        verifyDomain,
      });

      const spinner = ora(`Adding domain ${domain}`).start();
      const { httpURL, wsURL } = await addAPIGatewayDomain({
        certificateArn,
        domain,
        httpApiId,
        wsApiId,
      });
      const { DomainNameConfigurations } = await apiGateway.getDomainName({
        DomainName: wildcard,
      });
      invariant(DomainNameConfigurations);
      spinner.succeed();

      console.info("API:\t\t%s", httpURL);
      console.info("WebSocket:\t%s", wsURL);

      console.info(chalk.green.bold("\n2. Update your DNS:\n"));
      console.info(
        "Please update your DNS by adding the following CNAME record:"
      );
      console.info("CNAME name:\t%s", wildcard);
      for (const { ApiGatewayDomainName } of DomainNameConfigurations)
        console.info("CNAME value:\t%s", ApiGatewayDomainName);

      console.info(
        chalk.green.bold(
          "\n3. After you update your DNS, deploy your project again\n"
        )
      );
      console.info("npx queue-run deploy");
    }
  );

command
  .command("remove")
  .description("remove custom domain")
  .argument("<domain>", "domain name, eg example.com")
  .action(async (domain: string) => {
    const { name } = await loadProject();
    const { httpApiId, wsApiId } = await getAPIGatewayIds(name);
    if (!(httpApiId && wsApiId)) throw new Error("Project not deployed");

    const wildcard = domain.startsWith("*.") ? domain : `*.${domain}`;
    const spinner = ora(`Removing domain ${domain}`).start();
    await removeAPIGatewayDomain({ domain, httpApiId, wsApiId });
    await discardCertificateRequest(wildcard);
    spinner.succeed();
  });

export default command;
