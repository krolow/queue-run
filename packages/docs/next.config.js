const rehypeHighlight = require("rehype-highlight");

const withMDX = require("@next/mdx")({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [],
    rehypePlugins: [rehypeHighlight],
  },
});
module.exports = withMDX({});
