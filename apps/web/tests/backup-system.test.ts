import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("backup retention default and parser exist", () => {
  const source = fs.readFileSync(path.join(rootDir, "src", "lib", "backups.ts"), "utf8");
  assert.ok(source.includes("const DEFAULT_BACKUP_MAX_FILES = 5"), "default backup max should be 5");
  assert.ok(source.includes("export function getBackupMaxFiles()"), "backup max parser should be exported");
  assert.ok(source.includes("enforceBackupRetention([name])"), "retention should preserve the newly created backup");
});

test("backup delete route is admin + csrf protected", () => {
  const source = fs.readFileSync(
    path.join(rootDir, "app", "api", "v1", "admin", "settings", "backups", "[name]", "route.ts"),
    "utf8"
  );
  assert.ok(source.includes("export async function DELETE"), "delete endpoint must exist");
  assert.ok(source.includes("requireAdmin("), "delete endpoint must require admin");
  assert.ok(source.includes("requireCsrf("), "delete endpoint must require csrf");
});

test("backup scheduler job is seeded and has a handler", () => {
  const dbSource = fs.readFileSync(path.join(rootDir, "src", "db.ts"), "utf8");
  const defsSource = fs.readFileSync(path.join(rootDir, "src", "lib", "jobs", "definitions.ts"), "utf8");

  assert.ok(dbSource.includes("('backup-snapshot', '30 2 * * *', 86400, 'system', FALSE)"), "backup job seed missing");
  assert.ok(defsSource.includes("\"backup-snapshot\":"), "backup job handler missing");
  assert.ok(defsSource.includes("createBackupArchive({ trigger: \"job\" })"), "backup job should mark trigger as job");
});
