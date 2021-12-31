module.exports = {
  title: "🐇 QueueRun",
  url: "https://queue.run",
  baseUrl: "/",
  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  presets: [
    [
      "@docusaurus/preset-classic",
      {
        blog: false,
        docs: { path: "../../docs", routeBasePath: "/" },
      },
    ],
  ],
  themeConfig: {
    hideableSidebar: true,
    navbar: {
      title: "🐇 QueueRun",
      hideOnScroll: true,
      items: [
        { to: "intro", label: "Guides", position: "left" },
        {
          href: "https://github.com/assaf/queue-run",
          label: "GitHub",
          position: "right",
          target: "_blank",
        },
      ],
    },
  },
};
