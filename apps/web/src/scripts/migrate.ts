#!/usr/bin/env tsx

/**
 * Migration CLI Tool
 *
 * Usage:
 *   npm run migrate              - Run all pending migrations
 *   npm run migrate:status       - Show migration status
 *   npm run migrate:create NAME  - Create a new migration file
 */

import { runMigrations, listMigrations, closeMigrationPool } from "../lib/migrations";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from root .env file
const rootEnvPath = path.resolve(__dirname, "../../../../.env");
if (fs.existsSync(rootEnvPath)) {
  config({ path: rootEnvPath });
} else {
  console.warn("⚠️  Warning: .env file not found at", rootEnvPath);
}

const command = process.argv[2];
const arg = process.argv[3];

async function main() {
  switch (command) {
    case "status":
      await listMigrations();
      break;

    case "create":
      if (!arg) {
        console.error("❌ Error: Migration name required");
        console.log("   Usage: npm run migrate:create <name>");
        console.log("   Example: npm run migrate:create add_user_roles");
        process.exit(1);
      }
      await createMigration(arg);
      break;

    default:
      // Default: run migrations
      await runMigrations();
      break;
  }
}

/**
 * Creates a new migration file
 */
async function createMigration(name: string) {
  const migrationsDir = path.resolve(__dirname, "../../migrations");

  // Get next version number
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort();

  let nextVersion = "001";
  if (files.length > 0) {
    const lastFile = files[files.length - 1];
    const lastVersion = parseInt(lastFile.split("_")[0], 10);
    nextVersion = String(lastVersion + 1).padStart(3, "0");
  }

  // Clean name (lowercase, underscores)
  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  const filename = `${nextVersion}_${cleanName}.sql`;
  const filepath = path.join(migrationsDir, filename);

  // Create migration template
  const template = `-- Migration: ${nextVersion}_${cleanName}
-- Description: ${cleanName.replace(/_/g, " ")}
-- Created: ${new Date().toISOString().split("T")[0]}

-- Add your SQL here
-- Example:
-- ALTER TABLE app_user ADD COLUMN new_field TEXT;
-- CREATE INDEX idx_app_user_new_field ON app_user(new_field);
`;

  fs.writeFileSync(filepath, template, "utf-8");

  console.log(`\n✅ Created migration: ${filename}`);
  console.log(`   Location: ${filepath}`);
  console.log(`\n   Edit this file and add your SQL, then run:`);
  console.log(`   npm run migrate\n`);
}

// Run the CLI
main()
  .then(() => closeMigrationPool())
  .catch(async (error) => {
    console.error("❌ Error:", error);
    await closeMigrationPool();
    process.exit(1);
  });
