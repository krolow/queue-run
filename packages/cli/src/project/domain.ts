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
      const { name, region } = await loadProject();

      console.info(
        chalk.green.bold("\n1. Let's get you a new TLS certificate\n")
      );
      await addDomain({ domain, method, project: name, region, verifyDomain });

      console.info(chalk.green.bold("\n2. Update your DNS:\n"));
      await updateCNames({ domain, region });

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
  region,
  verifyDomain,
}: {
  domain: string;
  method: "email" | "dns" | undefined;
  project: string;
  region: string;
  verifyDomain: string | undefined;
}) {
  const certificateArn = await requestCertificate({
    domain,
    method,
    verifyDomain,
  });

  const spinner = ora(`Adding domain ${domain}`).start();
  const { httpUrl, wsUrl } = await addAPIGatewayDomain({
    certificateArn,
    domain,
    project,
    region,
  });
  spinner.succeed(`HTTP API:\t${httpUrl}`);
  spinner.succeed(`WebSocket:\t${wsUrl}`);
}

async function updateCNames({
  domain,
  region,
}: {
  domain: string;
  region: string;
}) {
  const cnames = (
    await Promise.all([
      getCNames({ domain, region }),
      getCNames({ domain: `*.${domain}`, region }),
      getCNames({ domain: `ws.${domain}`, region }),
    ])
  ).flat();

  displayCNames(cnames);
  await waitForCNames(cnames);
}

async function getCNames({
  domain,
  region,
}: {
  domain: string;
  region: string;
}) {
  const apiGateway = new ApiGatewayV2({ region });
  const { DomainNameConfigurations } = await apiGateway.getDomainName({
    DomainName: domain,
  });
  invariant(DomainNameConfigurations);
  return DomainNameConfigurations.map(({ ApiGatewayDomainName }) => ({
    cname: domain,
    value: ApiGatewayDomainName!,
  }));
}

async function waitForCNames(cnames: { cname: string; value: string }[]) {
  let spinner = ora(`Checking DNS for updates …`).start();
  while (cnames.length > 0) {
    for (const { cname, value } of cnames) {
      const resolved = await dns.promises
        .resolve(cname, "CNAME")
        .catch(() => null);
      if (resolved?.includes(value)) {
        spinner.succeed(cname);
        cnames = cnames.filter(({ cname: name }) => name !== cname);
        spinner = ora(`Checking DNS for updates …`).start();
      }
    }
  }
  spinner.stop();
}

function displayCNames(cnames: { cname: string; value: string }[]) {
  console.info(
    "Please update your DNS by adding the following CNAME records:\n"
  );
  const left = Math.max(...cnames.map(({ cname }) => cname.length));
  const right = Math.max(...cnames.map(({ value }) => value.length));
  console.log("┌─%s─┬─%s─┐", "─".repeat(left), "─".repeat(right));
  console.log("│ %s │ %s │", "CNAME".padEnd(left), "VALUE".padEnd(right));
  console.log("├─%s─┼─%s─┤", "─".repeat(left), "─".repeat(right));
  for (const { cname, value } of cnames)
    console.log("│ %s │ %s │", cname.padEnd(left), value.padEnd(right));
  console.log("└─%s─┴─%s─┘", "─".repeat(left), "─".repeat(right));
  console.info("");
}

command
  .command("remove")
  .description("remove custom domain")
  .argument("<domain>", "domain name, eg example.com")
  .action(async (domain: string) => {
    const { name, region } = await loadProject();

    const spinner = ora(`Removing domain ${domain}`).start();
    await removeAPIGatewayDomain({ domain, project: name, region });
    await discardCertificateRequest(domain);
    spinner.succeed();
  });

export default command;
