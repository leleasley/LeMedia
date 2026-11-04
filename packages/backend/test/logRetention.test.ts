import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../src/utils/prisma.js';
import { pruneOldLogs } from '../src/utils/logEvent.js';

describe('pruneOldLogs', () => {
  beforeEach(async () => {
    await prisma.appLog.deleteMany();
    await prisma.pluginLog.deleteMany();
  });

  it('deletes rows older than the retention window and keeps fresh ones', async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.appLog.create({ data: { level: 'info', label: 'Test', message: 'old' } });
    await prisma.appLog.create({ data: { level: 'info', label: 'Test', message: 'fresh' } });
    // Backdate the first row past the default 30d window
    await prisma.appLog.updateMany({ where: { message: 'old' }, data: { createdAt: old } });

    const result = await pruneOldLogs(30);
    expect(result.appLog).toBe(1);
    const remaining = await prisma.appLog.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('fresh');
  });

  it('prunes plugin logs too', async () => {
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.pluginLog.create({ data: { pluginId: 'x', level: 'info', message: 'old' } });
    await prisma.pluginLog.updateMany({ where: { message: 'old' }, data: { createdAt: old } });
    const result = await pruneOldLogs(30);
    expect(result.pluginLog).toBe(1);
  });
});
