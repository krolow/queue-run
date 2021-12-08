import crypto from "crypto";

export default function createBearerToken() {
  const bearerToken = crypto.pseudoRandomBytes(32).toString("base64");
  const tokenId = crypto
    .createHash("sha256")
    .update(bearerToken)
    .digest("hex")
    .slice(0, 32);
  return { bearerToken, tokenId };
}
