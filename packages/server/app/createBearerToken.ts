import crypto from "crypto";

// Bearer token: client app sends this to the server in HTTP Authorization
// header, 40 characters long
//
// Token ID: SHA256 of the bearer token, 32 characters long

const tokenIDLength = 32;

export default function createBearerToken() {
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
