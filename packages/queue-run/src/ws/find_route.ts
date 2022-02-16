import invariant from "tiny-invariant";
import { loadMiddleware, loadModule } from "../shared/load_module.js";
import { loadManifest, WebSocketRoute } from "../shared/manifest.js";
import { WebSocketExports, WebSocketMiddleware } from "./exports.js";

const defaultMiddleware = {};

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
  module?: WebSocketExports;
  middleware: WebSocketMiddleware;
  route?: WebSocketRoute;
}> {
  const { socket } = await loadManifest();
  const route = socket.get("/");
  if (!route) {
    const middleware = await loadMiddleware<WebSocketMiddleware>(
      "socket",
      defaultMiddleware
    );
    return { middleware };
  }

  const loaded = await loadModule<WebSocketExports, WebSocketMiddleware>(
    route.filename,
    defaultMiddleware
  );
  invariant(loaded, "Could not load module");
  return { ...loaded, route };
}
