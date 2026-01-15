/**
 * Next.js Instrumentation Hook
 *
 * This file is called once when the Next.js server starts up.
 * Perfect for running database migrations and other initialization tasks.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server-side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // DISABLED: Automated migrations causing issues
    // The database schema is managed manually via db/init.sql
    // const { runMigrations } = await import("./lib/migrations");
    // try {
    //   await runMigrations();
    // } catch (error) {
    //   console.error("❌ Failed to run migrations during startup:", error);
    // }

    console.log("✓ Database migrations disabled - using manual schema management");
  }
}
