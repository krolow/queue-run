import jws from "jws";

type Header = {
  alg: string;
  kid?: string;
  typ: "JWT";
  [key: string]: any;
};
type Secret = string | Buffer | ArrayBuffer;

export type Payload = {
  iss?: string | undefined;
  sub?: string | undefined;
  aud?: string | string[] | undefined;
  exp?: number | undefined;
  nbf?: number | undefined;
  iat?: number | undefined;
  jti?: string | undefined;
  [key: string]: any;
};

export type GoogleProfile = Payload & {
  email_verified: boolean;
  email: string;
  family_name: string;
  given_name: string;
  hd?: string;
  iss: "https://accounts.google.com";
  name: string;
  picture: string;
};

/**
 * Verify JWT identity token.
 *
 * @params token The JWT token
 * @params secret The HMAC secret or public key (see below)
 * @params audience Typically this is your client ID (optional)
 * @params issuer The service that issued this token (optional)
 * @returns The payload of the JWT token (sub, email, image, etc)
 * @throws Response with status code 401 (no token) or 403 (token not valid or expired)
 *
 * The secret is either the HMAC secret of the RSA/ESCDA public key.
 *
 * It can be an object, mapping key IDs (`header.kid`) to secrets.
 *
 * It can be a function that resolves to one of the above.
 */
export async function verify<T extends Payload = Payload>({
  audience,
  issuer,
  secret,
  token,
}: {
  audience?: string | undefined;
  issuer?: string | undefined;
  token: string | undefined;
  secret:
    | Secret
    | { [key: string]: Secret }
    // eslint-disable-next-line no-unused-vars
    | ((header: Header) => Secret | Promise<Secret>);
}): Promise<T> {
  if (!token) throw new Response("No JWT token", { status: 401 });
  try {
    const { header, payload } = jws.decode(token);
    if (header.typ !== "JWT") throw new Error("Only JWT tokens are supported");

    const hashOrCert = await resolveSecret(header as Header, secret);
    const verified = jws.verify(token, header.alg, hashOrCert);
    if (!verified) throw new Error("Invalid signature");

    if (audience && payload.aud !== audience)
      throw new Error("Audience does not match");

    if (issuer && payload.iss !== issuer)
      throw new Error("Issuer does not match");

    return payload;
  } catch (error) {
    console.warn("Authentication: %s", String(error));
    throw new Response("Invalid or expired JWT token", { status: 403 });
  }
}

async function resolveSecret(
  header: Header,
  secret:
    | Secret
    | Record<string, Secret>
    // eslint-disable-next-line no-unused-vars
    | ((header: Header) => Secret | Promise<Secret>)
): Promise<Buffer> {
  if (Buffer.isBuffer(secret)) return secret;
  else if (typeof secret === "string") return Buffer.from(secret);
  else if (secret instanceof ArrayBuffer) return Buffer.from(secret);
  else if (typeof secret === "object" && secret)
    return await resolveSecret(header, secret[header.kid!]!);
  else if (typeof secret === "function") {
    const resolved = await resolveSecret(header, await secret(header));
    if (typeof resolved === "function")
      throw new Error("Function returned a function");
    return resolved;
  } else throw new Error("Invalid secret");
}

/**
 * Authenticates JWT token issued by Google OAuth.
 *
 * @params token The JWT token
 * @params clientId The Google OAuth client ID
 * @params domain Only accepts accounts using this domain (optional)
 * @returns The payload of the JWT token (sub, email, image, etc)
 * @throws Response with status code 401 (no token) or 403 (token not valid or expired)
 *
 * If you're using Google Workspaces, you can enable single sign-on for all
 * users in your Workspace domain. Internally, this checks the email address was
 * assigned by Google Workspace and belongs to the specified domain.
 */
export async function google({
  clientId,
  domain,
  token,
}: {
  clientId: string;
  domain?: string | undefined;
  token: string | undefined;
}): Promise<GoogleProfile> {
  const profile = await verify<GoogleProfile>({
    audience: clientId,
    issuer: "https://accounts.google.com",
    secret: (header) => googleCertificate(header),
    token,
  });
  if (domain && (!profile.hd || profile.hd !== domain))
    throw new Response("Invalid domain", { status: 403 });
  return profile;
}

async function googleCertificate(header: Header) {
  if (!googleCertificates) {
    googleCertificates = (async () => {
      const response = await fetch(
        "https://www.googleapis.com/oauth2/v1/certs"
      );
      if (!response.ok)
        throw new Error(
          `${response.url} => ${response.status} ${response.statusText}`
        );
      return await response.json();
    })();
  }
  const certificate = (await googleCertificates)[header.kid!];
  if (!certificate)
    throw new Response("Invalid or expired JWT token", { status: 403 });
  return certificate;
}

let googleCertificates: Promise<Record<string, string>>;
