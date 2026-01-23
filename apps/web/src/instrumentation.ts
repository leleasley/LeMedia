/**
 * Next.js Instrumentation Hook
 *
 * This file is called once when the Next.js server starts up.
 * Perfect for running database migrations and other initialization tasks.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

/**
 * Check for dangerous debug flags in production
 */
function checkDebugFlagsInProduction() {
  if (process.env.NODE_ENV !== "production") {
    return; // Only check in production
  }

  const dangerousFlags = {
    AUTH_DEBUG: process.env.AUTH_DEBUG,
    OIDC_DEBUG: process.env.OIDC_DEBUG,
    DEBUG: process.env.DEBUG,
  };

  const enabledFlags = Object.entries(dangerousFlags)
    .filter(([_, value]) => value === "1" || value === "true")
    .map(([key]) => key);

  if (enabledFlags.length > 0) {
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("⚠️  SECURITY WARNING: DEBUG FLAGS ENABLED IN PRODUCTION");
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("");
    console.error("The following debug flags are enabled:");
    enabledFlags.forEach(flag => {
      console.error(`  - ${flag}=${process.env[flag]}`);
    });
    console.error("");
    console.error("⚠️  This may leak sensitive information including:");
    console.error("  • Session tokens");
    console.error("  • User credentials");
    console.error("  • API keys");
    console.error("  • Internal system details");
    console.error("");
    console.error("RECOMMENDATION: Disable all debug flags in production");
    console.error("Set the following environment variables to empty:");
    enabledFlags.forEach(flag => {
      console.error(`  unset ${flag}`);
    });
    console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.error("");
  }
}

export async function register() {
  // Only run on server-side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Check for debug flags in production
    checkDebugFlagsInProduction();

    const autoMigrations = process.env.AUTO_MIGRATIONS !== "false";
    const allowDuringBuild = process.env.AUTO_MIGRATIONS_ALLOW_BUILD === "true";
    const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

    if (!autoMigrations) {
      console.log("✓ Database migrations disabled (AUTO_MIGRATIONS=false)");
      return;
    }

    if (isBuildPhase && !allowDuringBuild) {
      console.log("✓ Skipping migrations during build phase");
      return;
    }

    const { runMigrations } = await import("./lib/migrations");
    try {
      await runMigrations();
    } catch (error) {
      console.error("❌ Failed to run migrations during startup:", error);
    }
  }
}
