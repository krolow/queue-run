import type { PushMessageFunction } from "./pushMessage";

type Globals = {
  pushMessage: PushMessageFunction;
};

declare global {
  var _qr: Globals;
}
