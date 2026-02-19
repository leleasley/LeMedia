import nextConfig from "eslint-config-next";

const config = [
  { ignores: ["public/sw.js"] },
  ...nextConfig,
];

export default config;
