import type {
  JwtHeader,
  JwtPayload,
  Secret,
  SigningKeyCallback,
} from "jsonwebtoken";
import jsonwebtoken from "jsonwebtoken";

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
 * The secret is either the HMAC secret of the RSA/ESCDA public key. It can be a
 * string or a buffer.
 *
 * It can also be an object, with multiple secrets for each key ID (kid). Some
 * services use multiple secrets and this will pick the right secret based on
 * the key ID contained in the JWT header.
 *
 * It can also be a function that returns the secret. For example, the Google
 * helper loads all the certificate and returns the correct one based on the key
 * ID.
 */
export async function verify<Payload = JwtPayload>({
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
    | ((header: JwtHeader) => Secret | Promise<Secret>);
}): Promise<Payload> {
  if (!token) throw new Response("No JWT token", { status: 401 });
  try {
    return await new Promise((resolve, reject) => {
      jsonwebtoken.verify(
        token,
        resolveSecret(secret),
        { complete: false, audience, issuer },
        (error: Error | null, decoded: unknown) => {
          if (decoded) resolve(decoded as Payload);
          else reject(error);
        }
      );
    });
  } catch {
    throw new Response("Invalid or expired JWT token", { status: 403 });
  }
}

function resolveSecret(
  secret:
    | Secret
    | Record<string, Secret>
    // eslint-disable-next-line no-unused-vars
    | ((header: JwtHeader) => Secret | Promise<Secret>)
) {
  return async function (header: JwtHeader, callback: SigningKeyCallback) {
    if (typeof secret === "string" || Buffer.isBuffer(secret)) {
      callback(null, secret);
    } else if (typeof secret === "function") {
      try {
        const value = await secret(header);
        if (!value) throw new Error("Function did not return a secret");
        callback(null, value);
      } catch (error) {
        callback(error);
      }
    } else if (typeof secret === "object") {
      const value =
        header.kid && (secret as Record<string, Secret>)[header.kid];
      if (value) callback(null, value);
      else callback(new Error(`No key found for kid "${header.kid}"`));
    } else return secret;
  };
}

type GoogleProfile = JwtPayload & {
  aud: string;
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

async function googleCertificate(header: JwtHeader) {
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
