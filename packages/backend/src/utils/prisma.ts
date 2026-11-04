import { PrismaClient } from '@prisma/client';
import { logEvent } from './logEvent.js';

export const prisma = new PrismaClient();

// WAL: readers don't block while a writer holds the lock. PRAGMA returns the resulting mode
// as a row, so it has to go through $queryRawUnsafe — $executeRawUnsafe rejects result rows.
prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;')
  .catch((err) => logEvent('warn', 'Prisma', `Failed to enable WAL mode: ${err}`));

// Wait for the write lock instead of failing immediately when something outside this process
// holds it (a backup snapshot, the sqlite3 CLI). The *arr-side socket timeout is the real
// backstop; this just stops transient external locks from surfacing as P1008 500s.
// NOTE: these apply per-connection, which is why DATABASE_URL pins connection_limit=1 — with a
// pooled setup the PRAGMA would only reach one of the connections.
prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000;')
  .catch((err) => logEvent('warn', 'Prisma', `Failed to set busy_timeout: ${err}`));

// WAL makes NORMAL durable enough (only a power loss can lose the last commit) and removes an
// fsync from every write — a meaningful win when requests arrive in bursts.
prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL;')
  .catch((err) => logEvent('warn', 'Prisma', `Failed to set synchronous mode: ${err}`));
