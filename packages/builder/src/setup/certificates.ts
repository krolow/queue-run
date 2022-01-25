import { ACM, CertificateDetail } from "@aws-sdk/client-acm";
import inquirer from "inquirer";
import ora from "ora";
import invariant from "tiny-invariant";

const acm = new ACM({});

/**
 * Request a certificate for the given domain.
 *
 * This method blocks until the certificate is issued, or an error occurs.
 *
 * If the verification method is not specified, it will ask the user to select
 * the verification method.
 *
 * @param domain The domain name
 * @param method Verification method is either "email" or "dns"
 * @param verifyDomain The domain name to use for email verification
 * @returns The certificate ARN
 */
export async function requestCertificate({
  domain,
  method,
  verifyDomain,
}: {
  domain: string;
  method?: "email" | "dns" | undefined;
  verifyDomain?: string | undefined;
}): Promise<string> {
  const spinner = ora("Looking up existing certificate").start();
  const wildcard = `*.${domain}`;
  const certificate = await findCertificate(wildcard);
  spinner.succeed();
  if (certificate?.Status === "ISSUED") return certificate.CertificateArn!;

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "method",
      message: "How do you want to verify your domain?",
      choices: [
        { name: "Use a DNS record (recommended)", value: "dns" },
        { name: "Send me an email (faster)", value: "email" },
      ],
      default: "dns",
      when: () => !method,
    },
    {
      type: "text",
      name: "email",
      default: verifyDomain ?? domain,
      message: "Which domain should I send the verification email to?",
      when: (answers) => answers.method === "EMAIL" && !verifyDomain,
    },
  ]);

  const arn =
    answers.method === "email"
      ? await useEmailVerification({
          domain,
          verifyDomain: answers.verifyDomain,
        })
      : await useDNSVerification({ certificate, domain });

  await waitForCertificateIssued(arn);
  return arn;
}

export async function discardCertificateRequest(domain: string) {
  const wildcard = `*.${domain}`;
  const certificate = await findCertificate(wildcard);
  if (certificate?.Status !== "ISSUED") {
    await acm.deleteCertificate({
      CertificateArn: certificate!.CertificateArn!,
    });
    await discardCertificateRequest(domain);
  }
}

async function findCertificate(
  domain: string,
  nextToken?: string
): Promise<CertificateDetail | null> {
  const { CertificateSummaryList, NextToken } = await acm.listCertificates({
    ...(nextToken && { NextToken: nextToken }),
  });
  const certificateArn = CertificateSummaryList?.find(
    (certificate) => certificate.DomainName === domain
  )?.CertificateArn;
  if (!certificateArn)
    return NextToken ? findCertificate(domain, NextToken) : null;

  const { Certificate } = await acm.describeCertificate({
    CertificateArn: certificateArn,
  });
  return Certificate ?? null;
}

async function waitForCertificateIssued(arn: string) {
  const spinner = ora("Waiting for request to be verified").start();
  let status: string = "PENDING_VALIDATION";
  while (status === "PENDING_VALIDATION") {
    const { Certificate } = await acm.describeCertificate({
      CertificateArn: arn,
    });
    invariant(Certificate?.Status, "Certificate deleted");
    status = Certificate.Status;
    if (status === "ISSUED") return;
    if (status !== "PENDING_VALIDATION")
      throw new Error(`Certificate verification failed ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  spinner.succeed();
}

async function useEmailVerification({
  domain,
  verifyDomain,
}: {
  domain: string;
  verifyDomain: string;
}): Promise<string> {
  const spinner = ora("Requesting a new certificate").start();
  const wildcard = `*.${domain}`;
  const { CertificateArn } = await acm.requestCertificate({
    DomainName: domain,
    DomainValidationOptions: [
      { DomainName: wildcard, ValidationDomain: verifyDomain },
    ],
    SubjectAlternativeNames: [domain],
    ValidationMethod: "EMAIL",
  });
  invariant(CertificateArn);

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const { Certificate } = await acm.describeCertificate({
    CertificateArn,
  });
  invariant(Certificate, "Certificate deleted");
  spinner.succeed();

  const recipients = Certificate.DomainValidationOptions?.find(
    ({ ValidationMethod }) => ValidationMethod === "EMAIL"
  )!.ValidationEmails!;
  console.info("Sending verification request to:\n%s", recipients.join("\n"));

  return CertificateArn;
}

async function useDNSVerification({
  certificate,
  domain,
}: {
  certificate: CertificateDetail | null;
  domain: string;
}): Promise<string> {
  let validation = certificate?.DomainValidationOptions?.find(
    ({ ValidationMethod }) => ValidationMethod === "DNS"
  );

  if (!validation) {
    const spinner = ora("Requesting a new certificate").start();
    const wildcard = `*.${domain}`;
    const { CertificateArn } = await acm.requestCertificate({
      DomainName: wildcard,
      ValidationMethod: "DNS",
      SubjectAlternativeNames: [domain],
    });

    while (!validation) {
      const { Certificate } = await acm.describeCertificate({
        CertificateArn,
      });
      validation = Certificate?.DomainValidationOptions?.find(
        ({ ValidationMethod }) => ValidationMethod === "DNS"
      );
    }

    spinner.succeed();
  }

  invariant(validation.ResourceRecord);
  const { Name, Value } = validation.ResourceRecord;
  invariant(Name && Value);

  console.info("Update your DNS and add the following CNAME record:");
  const left = Name.length;
  const right = Value.length;
  console.info("┌─%s─┬─%s─┐", "─".repeat(left), "─".repeat(right));
  console.info("│ %s │ %s │", "CNAME".padEnd(left), "VALUE".padEnd(right));
  console.info("├─%s─┼─%s─┤", "─".repeat(left), "─".repeat(right));
  console.info("│ %s │ %s │", Name.padEnd(left), Value.padEnd(right));
  console.info("└─%s─┴─%s─┘", "─".repeat(left), "─".repeat(right));
  console.info("");

  console.info(
    "\nWaiting for DNS changes to propagate, this could take a while ..."
  );
  console.info(
    "You can check DNS propagation here:\n%s",
    `https://dns.google/query?name=${Name}&rr_type=CNAME&ecs=`
  );
  return certificate!.CertificateArn!;
}
