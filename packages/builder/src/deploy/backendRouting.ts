import { DynamoDB } from "@aws-sdk/client-dynamodb";

export async function addBackendRouting({
  lambdaARN,
  slug,
  url,
}: {
  lambdaARN: string;
  slug: string;
  url: string;
}) {
  const { hostname } = new URL(url);
  const dynamoDB = new DynamoDB({});
  console.info("   Updated routing table");
  try {
    await dynamoDB.executeStatement({
      Statement: `INSERT INTO "qr-backends" VALUE {'hostname': ?, 'slug' : ?, 'lambda_arn': ?, 'created_at': ?}`,
      Parameters: [
        { S: hostname },
        { S: slug },
        { S: lambdaARN },
        { N: String(Date.now()) },
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateItemException")
      return;
    else throw error;
  }
}

export async function getBackendRouting(url: string): Promise<{
  lambdaARN: string;
  slug: string;
  lastAccessedAt?: Date;
} | null> {
  const { hostname } = new URL(url);
  const dynamoDB = new DynamoDB({});
  const { Items: backends } = await dynamoDB.executeStatement({
    Statement: `SELECT * FROM "qr-backends" WHERE hostname = ?`,
    Parameters: [{ S: hostname }],
  });
  const backend = backends?.[0];
  if (!backend) return null;

  const slug = backend.slug?.S;
  const lambdaARN = backend.lambad_arn?.S;
  const lastAccessedAt =
    backend.last_accessed_at && new Date(Number(backend.last_accessed_at.N));
  return { slug, lambdaARN, lastAccessedAt };
}
