module.exports = {
  theme: {
    extend: {
      fontFamily: {
        title: ["Inter", "Roboto", "Helvetica", "Arial", "sans-serif"],
        body: ["Inter", "Roboto", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/line-clamp"),
  ],
  mode: "jit",
  content: ["./app/**/*.{ts,tsx}", "./public/**/*.html"],
};
