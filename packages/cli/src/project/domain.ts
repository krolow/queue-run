import { ACM, CertificateDetail } from "@aws-sdk/client-acm";
import { ApiGatewayV2 } from "@aws-sdk/client-apigatewayv2";
import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import {
  addAPIGatewayDomain,
  getAPIGatewayIds,
  removeAPIGatewayDomain,
} from "queue-run-builder";
import invariant from "tiny-invariant";
import { loadProject } from "./project.js";

const command = new Command("domain");
const apiGateway = new ApiGatewayV2({});
const acm = new ACM({});

command
  .command("add")
  .description("add custom domain")
  .argument("<domain>", "domain name, eg example.com")
  .action(async (domain: string) => {
    const { name } = await loadProject();
    const { httpApiId, wsApiId } = await getAPIGatewayIds(name);
    if (!(httpApiId && wsApiId))
      throw new Error('Project not deployed: run "npx queue-run deploy"');
    await addDomain({ domain, httpApiId, wsApiId });
  });

async function addDomain({
  domain,
  httpApiId,
  wsApiId,
}: {
  domain: string;
  httpApiId: string;
  wsApiId: string;
}) {
  const wildcard = domain.startsWith("*.") ? domain : `*.${domain}`;

  console.info(chalk.green.bold("\n1. Let's get you a TLS certificate\n"));
  const certificate = await findCertificate(wildcard);
  if (certificate?.Status === "ISSUED") {
    const { httpURL, wsURL } = await addAPIGatewayDomain({
      certificateArn: certificate.CertificateArn!,
      domain,
      httpApiId,
      wsApiId,
    });
    const { DomainNameConfigurations } = await apiGateway.getDomainName({
      DomainName: wildcard,
    });
    invariant(DomainNameConfigurations);

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
  } else {
    const { method, email } = await inquirer.prompt([
      {
        type: "list",
        name: "method",
        message: "How do you want to verify your domain?",
        choices: [
          { name: "Use a DNS record (recommended)", value: "DNS" },
          { name: "Send me an email", value: "EMAIL" },
        ],
      },
      {
        type: "text",
        name: "email",
        default: domain,
        message: "Which domain should I send the verification email to?",
        when: (answers) => answers.method === "EMAIL",
      },
    ]);

    if (method === "EMAIL") await useEmailVerification({ domain, email });
    else await useDNSVerification({ certificate, domain });

    const prompt =
      method === "EMAIL"
        ? "Did you confirm the certificate request email?"
        : "Did you update your DNS?";
    const { verified } = await inquirer.prompt([
      { type: "confirm", name: "verified", message: prompt },
    ]);
    if (!verified) process.exit(1);

    await addDomain({ domain, httpApiId, wsApiId });
  }
}

async function findCertificate(
  domain: string,
  nextToken?: string
): Promise<CertificateDetail | null> {
  const { CertificateSummaryList, NextToken } = await acm.listCertificates({
    ...(nextToken && { NextToken: nextToken }),
  });
  const certificate = CertificateSummaryList?.find(
    (certificate) => certificate.DomainName === domain
  )?.CertificateArn;
  if (!certificate)
    return NextToken ? findCertificate(domain, NextToken) : null;

  const { Certificate } = await acm.describeCertificate({
    CertificateArn: certificate,
  });
  return Certificate ?? null;
}

async function useEmailVerification({
  domain,
  email,
}: {
  domain: string;
  email: string;
}) {
  const { CertificateArn } = await acm.requestCertificate({
    DomainName: domain,
    DomainValidationOptions: [{ DomainName: domain, ValidationDomain: email }],
    ValidationMethod: "EMAIL",
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const { Certificate } = await acm.describeCertificate({
    CertificateArn,
  });
  invariant(Certificate);

  const recipients = Certificate.DomainValidationOptions?.find(
    ({ ValidationMethod }) => ValidationMethod === "EMAIL"
  )!.ValidationEmails!;
  console.info("Sending verification request to:\n%s", recipients.join("\n"));
}

async function useDNSVerification({
  certificate,
  domain,
}: {
  certificate: CertificateDetail | null;
  domain: string;
}) {
  const validation = certificate?.DomainValidationOptions?.find(
    ({ ValidationMethod }) => ValidationMethod === "DNS"
  )?.ResourceRecord;
  if (validation) {
    console.info("Update your DNS records and add the following CNAME:");
    console.info("CNAME name:\t%s", validation.Name);
    console.info("CNAME value:\t%s", validation.Value);
  } else {
    const { CertificateArn } = await acm.requestCertificate({
      DomainName: domain,
      ValidationMethod: "DNS",
    });
    const { Certificate } = await acm.describeCertificate({
      CertificateArn,
    });
    invariant(Certificate);
    await useDNSVerification({ certificate: Certificate, domain });
  }
}

command
  .command("remove")
  .description("remove custom domain")
  .argument("<domain>", "domain name, eg example.com")
  .action(async (domain: string) => {
    const { name } = await loadProject();
    const { httpApiId, wsApiId } = await getAPIGatewayIds(name);
    if (!(httpApiId && wsApiId)) throw new Error("Project not deployed");
    await removeAPIGatewayDomain({ domain, httpApiId, wsApiId });
  });

export default command;
