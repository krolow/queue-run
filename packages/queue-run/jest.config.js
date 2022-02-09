/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  extensionsToTreatAsEsm: [".ts"],
  globals: { "ts-jest": { useESM: true } },
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  notify: true,
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/.queue-run/", "/build/"],
};
