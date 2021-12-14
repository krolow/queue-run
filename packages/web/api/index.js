const { createRequestHandler } = require("@remix-run/vercel");

export default createRequestHandler({
  build: require("./build"),
});
