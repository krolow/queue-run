import { getLocalStorage, selfPath } from "../shared/index.js";

/* eslint-disable no-unused-vars */
interface WebSocketFunction<T = object | string> {
  (channel: string): WebSocketFunction<T>;
  get: <T>(channel: string) => WebSocketFunction<T>;
  self: <T>() => WebSocketFunction<T>;
  send(payload: T): Promise<void>;
  to(userID: string): WebSocketFunction<T>;
  to(userIDs: string[]): WebSocketFunction<T>;
  channel: string;
}
/* eslint-enable no-unused-vars */

const sockets: WebSocketFunction = newChannel("");
export default sockets;

// eslint-disable-next-line sonarjs/cognitive-complexity
function newChannel<T = object | string>(
  channel: string,
  to?: string[]
): WebSocketFunction<T> {
  if (!/^[a-zA-Z0-9_-]*$/.test(channel))
    throw new Error("Invalid channel name");

  const socketFn: WebSocketFunction<T> = (channel) => socketFn.get(channel);
  socketFn.get = <T>(channel: string) => newChannel<T>(channel, to);
  socketFn.self = <T>() => {
    const pathname = selfPath();
    if (!pathname.startsWith("sockets/"))
      throw new Error("You can only use self from a socket handler");
    return socketFn.get<T>(pathname.slice(7));
  };
  socketFn.send = async (payload) => {
    const local = getLocalStorage();
    const userIDs = Array.isArray(to)
      ? to
      : to
      ? [to]
      : local.user?.id
      ? [local.user.id]
      : [];

    if (!userIDs.length) return;
    const message =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    return await local.sendWebSocketMessage({ message, userIDs });
  };
  socketFn.to = (userIDs) =>
    newChannel<T>(channel, Array.isArray(userIDs) ? userIDs : [userIDs]);

  socketFn.toString = () => channel;
  socketFn.valueOf = () => channel;
  socketFn.channel = channel;

  return socketFn;
}
