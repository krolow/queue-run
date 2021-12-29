module.exports = {
  experimental: { esmExternals: true },
  webpack(config, options) {
    config.module.rules.push({
      test: /\.mdx?$/,
      use: [
        // The default `babel-loader` used by Next:
        options.defaultLoaders.babel,
        {
          loader: "@mdx-js/loader",
        },
      ],
    });
    return config;
  },
};
