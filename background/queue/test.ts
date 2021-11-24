import fs from "fs/promises";
import data from "./data";
import common from "./_common";

export default async function (payload: { text: string }) {
  console.log("Payload 1: %o", payload);
  await fs.readdir(".");
}

console.log(
  "Loading %s with %s and %s in %s",
  module.id,
  common(),
  data,
  process.env.NODE_ENV
);

export const config = {
  retries: 2,
};
