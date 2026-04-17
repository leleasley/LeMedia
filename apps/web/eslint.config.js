import nextConfig from "eslint-config-next";

const config = [
  { ignores: ["public/sw.js"] },
  ...nextConfig,
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    rules: {
      "react-hooks/error-boundaries": "error",
      "react-hooks/immutability": "error",
      "react-hooks/incompatible-library": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/purity": "error",
      "react-hooks/set-state-in-effect": "error",
    },
  },
];

export default config;
