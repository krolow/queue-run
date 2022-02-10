const {
  description,
  keywords,
  homepage,
} = require("../queue-run/package.json");

module.exports = {
  title: "🐇 QueueRun",
  url: homepage,
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        blog: false,
        docs: {
          path: "../../docs",
          routeBasePath: "/",
          sidebarCollapsed: false,
          sidebarPath: require.resolve("./sidebars.js"),
        },
        gtag: {
          trackingID: "G-MPPR8JCTVR",
          anonymizeIP: true,
        },
        theme: {
          customCss: [require.resolve("./src/css/custom.css")],
        },
      },
    ],
  ],
  themeConfig: {
    hideableSidebar: true,
    navbar: {
      title: "🐇 QueueRun",
      hideOnScroll: true,
      items: [{ to: "/", label: "Docs", position: "left" }],
    },
    metadata: [
      { name: "description", content: description },
      { name: "keywords", content: keywords.join(", ") },
    ],
    prism: {
      theme: require("prism-react-renderer/themes/nightOwl"),
    },
  },
};
