import crypto from "crypto";

const tokenIDLength = 32;

export default function createBearerToken(): {
  // Client app uses this, sends to server in HTTP Authorization header.
  //
  // Users will be dealing with this, so keep to 40 characters, base64.
  bearerToken: string;
  // Server uses this to verify token, and primary key in the database.
  // SHA256 of bearer token, first 32 characters.
  tokenID: string;
} {
  const bearerToken = crypto
    .pseudoRandomBytes(32)
    .toString("base64")
    .slice(0, 40);
  const tokenId = crypto
    .createHash("sha256")
    .update(bearerToken)
    .digest("hex")
    .slice(0, tokenIDLength);
  return { bearerToken, tokenId };
}
