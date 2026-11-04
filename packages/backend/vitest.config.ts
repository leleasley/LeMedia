import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Tests that touch the database share one SQLite file per file-level setup; running files in
    // parallel against the same handle produces flakes that look like product bugs.
    fileParallelism: false,
    // Migration and restore tests run real `prisma migrate` steps — slow CI disks need headroom.
    testTimeout: 30_000,
    setupFiles: ['test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/services/**', 'src/utils/**', 'src/middleware/**'],
      reporter: ['text-summary'],
    },
  },
});
