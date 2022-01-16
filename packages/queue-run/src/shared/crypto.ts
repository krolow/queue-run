/* eslint-disable no-unused-vars */
import { Crypto as WebCrypto } from "@peculiar/webcrypto";
import { v4 as uuid } from "uuid";

class Crypto extends WebCrypto {
  randomUUID = uuid;
}

global.Crypto = Crypto;
global.crypto = new Crypto();

declare global {
  interface Crypto extends WebCrypto {
    randomUUID(): string;
  }
}

export { Crypto };
