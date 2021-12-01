export default function getEnvVariables() {
  return {
    NODE_ENV: process.env.NODE_ENV || "production",
  };
}
