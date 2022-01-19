import { ApiGatewayV2 } from "@aws-sdk/client-apigatewayv2";
import chalk from "chalk";
import { Command } from "commander";
import dns from "node:dns";
import ora from "ora";
import {
  addAPIGatewayDomain,
  discardCertificateRequest,
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

      console.info(
        chalk.green.bold("\n1. Let's get you a new TLS certificate\n")
      );
      await addDomain({ domain, method, project: name, verifyDomain });

      console.info(chalk.green.bold("\n2. Update your DNS:\n"));
      await updateCNames(domain);

      console.info(
        chalk.green.bold("\n3. Last step, we promise: re-deploy your project\n")
      );
      console.info("npx queue-run deploy");
    }
  );

async function addDomain({
  domain,
  method,
  project,
  verifyDomain,
}: {
  domain: string;
  method: "email" | "dns" | undefined;
  project: string;
  verifyDomain: string | undefined;
}) {
  const certificateArn = await requestCertificate({
    domain,
    method,
    verifyDomain,
  });

  const spinner = ora(`Adding domain ${domain}`).start();
  const { httpURL, wsURL } = await addAPIGatewayDomain({
    certificateArn,
    domain,
    project,
  });
  spinner.succeed();
  console.info("API:\t\t%s", httpURL);
  console.info("WebSocket:\t%s", wsURL);
}

async function updateCNames(domain: string) {
  const wildcard = domain.startsWith("*.") ? domain : `*.${domain}`;
  const { DomainNameConfigurations } = await apiGateway.getDomainName({
    DomainName: wildcard,
  });
  invariant(DomainNameConfigurations);

  console.info(
    "Please update your DNS by adding the following CNAME records:\n"
  );
  const cnames = [
    DomainNameConfigurations.map(({ ApiGatewayDomainName }) => ({
      cname: domain,
      value: ApiGatewayDomainName!,
    })),
    DomainNameConfigurations.map(({ ApiGatewayDomainName }) => ({
      cname: wildcard,
      value: ApiGatewayDomainName!,
    })),
  ].flat();
  console.info(
    "%s",
    cnames
      .map(
        ({ cname, value }) => `${cname.padEnd(wildcard.length + 1)}\t${value}`
      )
      .join("\n")
  );
  console.info("");
  for (const { cname, value } of cnames) await waitForCName(cname, value);
}

async function waitForCName(cname: string, value: string) {
  const spinner = ora(`Waiting for ${cname}`).start();
  let resolved = await dns.promises.resolve(cname, "CNAME").catch(() => null);
  while (!resolved?.includes(value)) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    resolved = await dns.promises.resolve(cname, "CNAME").catch(() => null);
  }
  spinner.succeed();
}

command
  .command("remove")
  .description("remove custom domain")
  .argument("<domain>", "domain name, eg example.com")
  .action(async (domain: string) => {
    const { name } = await loadProject();

    const spinner = ora(`Removing domain ${domain}`).start();
    await removeAPIGatewayDomain({ domain, project: name });
    await discardCertificateRequest(domain);
    spinner.succeed();
  });

export default command;
