import { Crypto as WebCrypto } from "@peculiar/webcrypto";
import { v4 as uuid } from "uuid";

export class Crypto extends WebCrypto {
  randomUUID = uuid;
}

global.Crypto = Crypto;
global.crypto = new Crypto();

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Crypto {
    // @ts-ignore
    randomUUID?: () => string;
  }
}
