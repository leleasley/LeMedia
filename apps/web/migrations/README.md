# Database Migrations

This directory contains version-controlled SQL migrations for the LeMedia database schema.

## How It Works

Migrations are automatically applied when the application starts up. The system:

1. Checks which migrations have already been applied (stored in `migration_history` table)
2. Runs any pending migrations in order
3. Records each successful migration in the tracking table

## Migration Files

Migrations are numbered sequentially:

- `001_initial_schema.sql` - Initial database schema
- `002_add_feature.sql` - Future migration example
- etc.

## Automatic Execution

**Migrations run automatically** when the Next.js app starts (via `src/instrumentation.ts`).

This happens:
- On `npm run dev` (development)
- On `npm run start` (production)
- When Docker container starts

No manual intervention required for normal deployments!

## Manual Migration Commands

If you need to run migrations manually:

### From Inside Docker Container

```bash
# Enter the app container
docker exec -it lemedia-app sh

# Run migrations
npm run migrate

# Check migration status
npm run migrate:status
```

### From Host Machine (requires database access)

```bash
# Run migrations
npm run migrate

# Check status
npm run migrate:status

# Create a new migration
npm run migrate:create add_new_feature
```

## Creating New Migrations

### Step 1: Generate Migration File

```bash
npm run migrate:create your_migration_name
```

This creates a new file like `002_your_migration_name.sql` with a template.

### Step 2: Edit the Migration

Open the generated file and add your SQL:

```sql
-- Migration: 002_add_user_roles
-- Description: add user roles
-- Created: 2026-01-15

ALTER TABLE app_user ADD COLUMN role TEXT DEFAULT 'user';
CREATE INDEX idx_app_user_role ON app_user(role);
```

### Step 3: Test Locally

```bash
# Start the app (migrations run automatically)
npm run dev

# Or run migrations manually
npm run migrate
```

### Step 4: Deploy

Commit your migration file to version control. When deployed, it will automatically run on app startup.

## Migration Best Practices

### DO ✅

- **Add columns with defaults**: `ADD COLUMN name TEXT DEFAULT 'value'`
- **Use IF NOT EXISTS**: `CREATE INDEX IF NOT EXISTS ...`
- **Test on development database first**
- **Keep migrations small and focused**
- **Write reversible operations** (where possible)
- **Document complex migrations with comments**

### DON'T ❌

- **Never edit applied migrations** (create a new one instead)
- **Don't drop columns immediately** (deprecate first)
- **Avoid long-running operations** without planning
- **Don't put data migrations and schema migrations together**
- **Never skip version numbers**

## Rollback Strategy

Migrations don't have automatic rollback (by design - keeps things simple).

If you need to undo a migration:

1. Create a new migration that reverses the changes
2. Example: If `005_add_column.sql` added a column, create `006_remove_column.sql` to drop it

## Troubleshooting

### "Migration failed" on startup

1. Check the error message in logs
2. Fix the SQL in the migration file
3. Restart the app

### Database in inconsistent state

If a migration partially applies:

1. Check `migration_history` table to see what completed
2. Manually fix the database or restore from backup
3. Update the migration file
4. Delete the failed entry from `migration_history` if needed
5. Restart the app

### Migrations not running

Ensure `experimental.instrumentationHook` is enabled in `next.config.mjs`:

```javascript
experimental: {
  instrumentationHook: true,
}
```

## Schema Version History

| Version | Description | Date | Status |
|---------|-------------|------|--------|
| 001 | Initial schema (from init.sql) | 2026-01-15 | ✅ Applied |

## Future Migrations

When adding new migrations, document them here:

| Version | Description | Date | Status |
|---------|-------------|------|--------|
| 002 | TBD | - | ⏳ Pending |
