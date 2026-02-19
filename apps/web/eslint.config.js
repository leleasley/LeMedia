import nextConfig from "eslint-config-next";

export default [
  { ignores: ["public/sw.js"] },
  ...nextConfig,
];
