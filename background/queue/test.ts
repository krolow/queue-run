import fs from "fs/promises";
import common from "./_common";

export default async function (payload: { text: string }) {
  console.log("Payload 1: %o", payload);
  await fs.readdir(".");
}

console.log("loading test.js with %s", common());

export const config = {
  retries: 2,
};
