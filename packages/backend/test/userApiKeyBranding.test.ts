import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { prisma } from '../src/utils/prisma.js';
import { generatePlainKey, hashKey, plainPrefix } from '../src/utils/userApiKey.js';
import { authenticateUserApiKey } from '../src/middleware/userApiKeyAuth.js';

const legacyKey = `lemedia_${'a'.repeat(64)}`;
const newKey = generatePlainKey();
let userId: number;

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: 'key-branding@example.test', displayName: 'Key User', role: 'user' } });
  userId = user.id;
  for (const key of [legacyKey, newKey]) {
    await prisma.userApiKey.create({ data: { userId, name: 'Test', keyHash: hashKey(key), prefix: plainPrefix(key) } });
  }
});

afterAll(async () => { await prisma.$disconnect(); });

function requestWith(key: string): FastifyRequest {
  return { headers: { 'x-api-key': key } } as unknown as FastifyRequest;
}

describe('user API key branding', () => {
  it('creates LeMedia keys with a useful display prefix', () => {
    expect(newKey).toMatch(/^lemedia_[a-f0-9]{64}$/);
    expect(plainPrefix(newKey)).toBe(newKey.slice(0, 'lemedia_'.length + 5));
  });

  it('continues to authenticate previously issued LeMedia keys', async () => {
    expect(await authenticateUserApiKey(requestWith(legacyKey))).toMatchObject({ id: userId });
    expect(plainPrefix(legacyKey)).toBe(legacyKey.slice(0, 'lemedia_'.length + 5));
  });

  it('authenticates newly issued LeMedia keys', async () => {
    expect(await authenticateUserApiKey(requestWith(newKey))).toMatchObject({ id: userId });
  });
});
