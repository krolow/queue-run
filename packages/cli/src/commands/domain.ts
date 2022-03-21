import { ApiGatewayV2 } from "@aws-sdk/client-apigatewayv2";
import chalk from "chalk";
import { Command, Option } from "commander";
import dns from "node:dns";
import ora from "ora";
import {
  addCustomDomain,
  discardCertificateRequest,
  displayTable,
  removeCustomDomain,
  requestCertificate,
} from "queue-run-builder";
import invariant from "tiny-invariant";
import { loadCredentials } from "../shared/config.js";

const command = new Command("domain");

command
  .command("add")
  .description("add custom domain")
  .argument("<domain>", 'domain name (example: "example.com")')
  .addOption(
    new Option("-m --method <method>", "verification method")
      .choices(["email", "dns"])
      .default("dns")
  )
  .addOption(
    new Option("-v --verify <domain>", "email verification domain").default(
      null,
      "same as <domain>"
    )
  )
  .action(
    async (
      domainName: string,
      {
        method,
        verifyDomain,
      }: {
        method?: "email" | "dns";
        verifyDomain?: string;
      }
    ) => {
      const { name, awsRegion: region } = await loadCredentials();

      console.info(
        chalk.green.bold("\n1. Let's get you a new TLS certificate\n")
      );
      await addDomain({
        domainName,
        method,
        project: name,
        region,
        verifyDomain,
      });

      console.info(chalk.green.bold("\n2. Update your DNS:\n"));
      await updateCNames({ domainName: domainName, region });

      console.info(
        chalk.green.bold("\n3. Last step, we promise: re-deploy your project\n")
      );
      console.info("npx queue-run deploy");
    }
  );

async function addDomain({
  domainName,
  method,
  project,
  region,
  verifyDomain,
}: {
  domainName: string;
  method: "email" | "dns" | undefined;
  project: string;
  region: string;
  verifyDomain: string | undefined;
}) {
  const certificateArn = await requestCertificate({
    domainName,
    method,
    verifyDomain,
  });

  const spinner = ora(`Adding domain ${domainName}`).start();
  const { httpUrl, wsUrl } = await addCustomDomain({
    certificateArn,
    domainName,
    project,
    region,
  });
  spinner.succeed(`HTTP API:\t${httpUrl}`);
  spinner.succeed(`WebSocket:\t${wsUrl}`);
}

async function updateCNames({
  domainName,
  region,
}: {
  domainName: string;
  region: string;
}) {
  const cnames = (
    await Promise.all([
      getCNames({ domainName: domainName, region }),
      getCNames({ domainName: `*.${domainName}`, region }),
      getCNames({ domainName: `ws.${domainName}`, region }),
    ])
  ).flat();

  displayCNames(cnames);
  await waitForCNames(cnames);
}

async function getCNames({
  domainName,
  region,
}: {
  domainName: string;
  region: string;
}) {
  const apiGateway = new ApiGatewayV2({ region });
  const { DomainNameConfigurations } = await apiGateway.getDomainName({
    DomainName: domainName,
  });
  invariant(DomainNameConfigurations);
  return DomainNameConfigurations.map(({ ApiGatewayDomainName }) => ({
    cname: domainName,
    value: ApiGatewayDomainName!,
  }));
}

async function waitForCNames(cnames: { cname: string; value: string }[]) {
  let spinner = ora(`Checking DNS for updates`).start();
  while (cnames.length > 0) {
    for (const { cname, value } of cnames) {
      const resolved = await dns.promises
        .resolve(cname, "CNAME")
        .catch(() => null);
      if (resolved?.includes(value)) {
        spinner.succeed(cname);
        cnames = cnames.filter(({ cname: name }) => name !== cname);
        spinner = ora(`Checking DNS for updates`).start();
      }
    }
  }
  spinner.stop();
}

function displayCNames(cnames: { cname: string; value: string }[]) {
  console.info(
    "Please update your DNS by adding the following CNAME records:\n"
  );
  displayTable({
    headers: ["CNAME", "VALUE"],
    rows: cnames.map(({ cname, value }) => [cname, value]),
  });
  console.info("");
}

command
  .command("remove")
  .description("remove custom domain")
  .argument("<domain>", 'domain name (example: "example.com")')
  .action(async (domainName: string) => {
    const { name, awsRegion: region } = await loadCredentials();

    const spinner = ora(`Removing domain ${domainName}`).start();
    await removeCustomDomain({ domainName, project: name, region });
    await discardCertificateRequest(domainName);
    spinner.succeed();
  });

export default command;
