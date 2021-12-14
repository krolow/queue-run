export default async function loadEnvVars() {
  return {
    NODE_ENV: process.env.NODE_ENV ?? "development",
  };
}
