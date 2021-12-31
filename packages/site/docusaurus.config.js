module.exports = {
  title: "🐇 QueueRun",
  url: "https://queue.run",
  baseUrl: "/",
  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        blog: false,
        docs: {
          path: "../../docs",
          routeBasePath: "/",
        },
        pages: {
          path: "../../docs",
          include: ["index.md"],
        },
      },
    ],
  ],
  themeConfig: {
    hideableSidebar: true,
  },
};
