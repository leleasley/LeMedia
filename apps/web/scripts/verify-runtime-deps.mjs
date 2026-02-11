#!/usr/bin/env node

import { createRequire } from "module";

const require = createRequire(import.meta.url);

const requiredModules = [
  "next",
  "react",
  "react-dom",
  "pg",
  "zod",
  "@duosecurity/duo_universal"
];

const missing = [];

for (const moduleName of requiredModules) {
  try {
    require.resolve(moduleName);
  } catch {
    missing.push(moduleName);
  }
}

if (missing.length > 0) {
  console.error("Missing runtime dependencies required for build:");
  for (const moduleName of missing) {
    console.error(`- ${moduleName}`);
  }
  console.error("");
  console.error("Fix:");
  console.error("1. Run `npm ci` from the repository root.");
  console.error("2. Re-run `npm run build`.");
  process.exit(1);
}

console.log("Runtime dependency check passed.");
