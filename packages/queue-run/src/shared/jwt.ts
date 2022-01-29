import type {
  JwtHeader,
  JwtPayload,
  Secret,
  SigningKeyCallback,
  VerifyOptions,
} from "jsonwebtoken";
import jsonwebtoken from "jsonwebtoken";

/**
 *
 * @param token The JWT token
 * @param secret Secret for HMAC algorithm, the PEM-encoded public key for RSA/ECDSA,
 * object mapping key ID to secret, or function called with header and returns secret
 * @param options Verify token based on algorithm, audience, issuer, subject, etc
 * @returns
 */
export async function verify<Payload = JwtPayload>(
  token: string,
  secret:
    | Secret
    | { [key: string]: Secret }
    // eslint-disable-next-line no-unused-vars
    | ((header: JwtHeader) => Secret | Promise<Secret>),
  options?: VerifyOptions
): Promise<Payload> {
  return await new Promise((resolve, reject) => {
    jsonwebtoken.verify(
      token,
      resolveSecret(secret),
      { complete: false, ...options },
      (error: Error | null, decoded: unknown) => {
        if (decoded) resolve(decoded as Payload);
        else reject(error);
      }
    );
  });
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
