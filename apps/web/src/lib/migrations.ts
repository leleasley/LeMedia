/**
 * Database Migration Runner
 *
 * Automatically applies SQL migrations on application startup.
 * Migrations are tracked in the `migration_history` table.
 */

import { Pool } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Migration {
  version: string;
  filename: string;
  sql: string;
}

/**
 * Creates a connection pool for migrations
 * (Separate from main app pool to avoid Next.js dependencies)
 */
let migrationPool: Pool | null = null;
function getMigrationPool(): Pool {
  if (!migrationPool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    migrationPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    });
  }
  return migrationPool;
}

/**
 * Ensures the migration_history table exists
 */
async function ensureMigrationTable() {
  const pool = getMigrationPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migration_history (
      version TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Gets list of applied migrations from the database
 */
async function getAppliedMigrations(): Promise<Set<string>> {
  const pool = getMigrationPool();
  const result = await pool.query<{ version: string }>(
    "SELECT version FROM migration_history ORDER BY version ASC"
  );
  return new Set(result.rows.map(row => row.version));
}

/**
 * Reads all migration files from the migrations directory
 */
function readMigrationFiles(): Migration[] {
  // Migrations are in apps/web/migrations/
  const migrationsDir = path.resolve(__dirname, "../../migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.log("⚠️  No migrations directory found");
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith(".sql"))
    .sort(); // Sort alphabetically to ensure order

  return files.map(filename => {
    const version = filename.replace(/\.sql$/, "");
    const filepath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filepath, "utf-8");
    return { version, filename, sql };
  });
}

/**
 * Applies a single migration
 */
async function applyMigration(migration: Migration) {
  const pool = getMigrationPool();

  console.log(`  ↳ Applying migration: ${migration.filename}`);

  try {
    // Execute migration SQL
    await pool.query(migration.sql);

    // Record in migration history
    await pool.query(
      "INSERT INTO migration_history (version, filename) VALUES ($1, $2)",
      [migration.version, migration.filename]
    );

    console.log(`  ✓ Applied: ${migration.filename}`);
  } catch (error: any) {
    console.error(`  ✗ Failed to apply migration ${migration.filename}:`, error.message);
    throw error;
  }
}

/**
 * Runs all pending migrations
 */
export async function runMigrations() {
  console.log("\n🔄 Checking for database migrations...");

  try {
    // Ensure migration tracking table exists
    await ensureMigrationTable();

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();
    console.log(`  ℹ️  ${appliedMigrations.size} migrations already applied`);

    // Read all migration files
    const allMigrations = readMigrationFiles();
    console.log(`  ℹ️  ${allMigrations.length} migration files found`);

    // Filter out already-applied migrations
    const pendingMigrations = allMigrations.filter(
      m => !appliedMigrations.has(m.version)
    );

    if (pendingMigrations.length === 0) {
      console.log("✅ Database schema is up to date\n");
      return;
    }

    console.log(`\n📝 Applying ${pendingMigrations.length} pending migration(s):\n`);

    // Apply each pending migration in order
    for (const migration of pendingMigrations) {
      await applyMigration(migration);
    }

    console.log(`\n✅ Successfully applied ${pendingMigrations.length} migration(s)\n`);
  } catch (error: any) {
    console.error("\n❌ Migration failed:", error.message);
    console.error("   Database may be in an inconsistent state!");
    throw error;
  }
}

/**
 * Lists migration status (for CLI commands)
 */
export async function listMigrations() {
  await ensureMigrationTable();

  const appliedMigrations = await getAppliedMigrations();
  const allMigrations = readMigrationFiles();

  console.log("\n📋 Migration Status:\n");
  console.log("  Version                    | Status   | Filename");
  console.log("  ---------------------------|----------|----------------------------");

  for (const migration of allMigrations) {
    const status = appliedMigrations.has(migration.version) ? "✓ Applied" : "⏳ Pending";
    console.log(`  ${migration.version.padEnd(26)} | ${status.padEnd(8)} | ${migration.filename}`);
  }

  console.log("");
}

/**
 * Closes the migration pool (for CLI commands)
 */
export async function closeMigrationPool() {
  if (migrationPool) {
    await migrationPool.end();
    migrationPool = null;
  }
}
