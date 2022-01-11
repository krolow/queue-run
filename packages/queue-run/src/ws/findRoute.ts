import invariant from "tiny-invariant";
import {
  loadManifest,
  loadModule,
  logError,
  WebSocketRoute,
} from "../shared/index.js";
import { WebSocketExports, WebSocketMiddleware } from "./exports.js";
import { logMessageReceived } from "./middleware.js";

/**
 * Load the WebSocket handler for the given message.
 *
 * @param data The raw message
 * @returns module All exports from the JavaScript module
 * @returns middleware Combined middleware from module, _middleware.ts, or default middleware
 * @returns socket The WebSocket handler configuration
 */
// eslint-disable-next-line no-unused-vars
export default async function findRoute(data: Buffer): Promise<{
  module: WebSocketExports;
  middleware: WebSocketMiddleware;
  socket: WebSocketRoute;
}> {
  const { sockets } = await loadManifest();
  const socket = sockets.get("/");
  if (!socket) throw new Error("Not Found");

  const loaded = await loadModule<WebSocketExports, WebSocketMiddleware>(
    socket.filename,
    { onMessageReceived: logMessageReceived, onError: logError }
  );
  invariant(loaded, "Could not load route module");
  const { module, middleware } = loaded;

  return { module, middleware, socket };
}
