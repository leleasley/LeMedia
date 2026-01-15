import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  SERVICES_SECRET_KEY: z.string().min(16),
  SERVICES_SECRET_KEY_VERSION: z.string().min(1).default("1"),
  SERVICES_SECRET_KEY_PREVIOUS: z.string().optional(),
  SERVICES_SECRET_KEY_PREVIOUS_VERSION: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3010),
});

let validated = false;

export function validateEnv() {
  if (validated) return;
  validated = true;

  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:");
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
}
