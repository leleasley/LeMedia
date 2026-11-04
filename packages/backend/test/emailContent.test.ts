import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/utils/prisma.js';
import { loadMasterKeyOrExit } from '../src/utils/secrets.js';
import { hashPassword } from '../src/utils/password.js';
import { startSmtpSink, type SmtpSink } from './helpers/smtpSink.js';

loadMasterKeyOrExit();

const { saveMailConfig } = await import('../src/services/mailer.js');
const { requestReset } = await import('../src/services/passwordReset.js');
const { createInvite } = await import('../src/services/userInvite.js');

let sink: SmtpSink;
const inviteEmail = 'invite-content@test.local';
const resetEmail = 'reset-content@test.local';
const EVIL_SITE = 'A&B <Test>';
const EVIL_NAME = 'O"Brien & Sons <img src=x>';

/** Unfold quoted-printable soft wraps so assertions see the real content. */
function unfolded(raw: string | undefined): string {
  return (raw ?? '').replace(/=\r?\n/g, '');
}

beforeAll(async () => {
  sink = await startSmtpSink();
  await saveMailConfig({
    enabled: true, transport: 'smtp', host: '127.0.0.1', port: sink.port,
    secure: false, user: '', password: '', fromEmail: 'LeMedia <no-reply@test.local>',
  });
});

afterAll(() => sink.close());

beforeEach(async () => {
  sink.received.length = 0;
  await prisma.passwordResetToken.deleteMany();
  await prisma.userInvite.deleteMany();
  await prisma.user.deleteMany({ where: { email: { in: [inviteEmail, resetEmail] } } });
  await prisma.appSettings.upsert({
    where: { id: 1 },
    update: { passwordResetEnabled: true, siteName: EVIL_SITE, siteUrl: 'https://lemedia.test' },
    create: { id: 1, passwordResetEnabled: true, siteName: EVIL_SITE, siteUrl: 'https://lemedia.test' },
  });
  await prisma.authProviderSettings.upsert({
    where: { provider: 'email' },
    update: { enabled: true },
    create: { provider: 'email', enabled: true, config: '{}' },
  });
  await prisma.user.create({
    data: { email: resetEmail, displayName: EVIL_NAME, passwordHash: await hashPassword('originalpass'), role: 'user' },
  });
});

async function delivered(): Promise<string> {
  await new Promise((r) => setTimeout(r, 300));
  const raw = unfolded(sink.received.at(-1));
  if (!raw) throw new Error('no mail was delivered');
  return raw;
}

describe('invite email content', () => {
  it('uses the outcome subject, not the bracketed brand repeat', async () => {
    const res = await createInvite(inviteEmail, 'user', 1);
    expect('error' in res && res.error).toBeFalsy();
    const raw = await delivered();
    const subject = /^Subject: (.*)$/m.exec(raw)?.[1] ?? '';
    expect(subject).toContain('invite ends tomorrow');
    expect(subject).not.toMatch(/^\[.*\]/);
  });

  it('extends the preheader instead of repeating the subject', async () => {
    await createInvite(inviteEmail, 'user', 1);
    const raw = await delivered();
    const html = raw.slice(raw.indexOf('<!doctype'));
    expect(html).toContain('Set your password in 2 minutes');
    expect(html).not.toContain(`You've been invited to join ${EVIL_SITE}`);
  });

  it('escapes site-controlled values interpolated into HTML', async () => {
    await createInvite(inviteEmail, 'user', 1);
    const raw = await delivered();
    // Scope to the HTML part: the Subject line legitimately carries the raw site name
    // (headers aren't HTML), but the body must never contain injectable markup.
    const html = raw.slice(raw.indexOf('<!doctype'));
    expect(raw).toContain('<!doctype');
    expect(html).not.toContain('<Test>');
    expect(html).toContain('A&amp;B');
  });

  it('includes a plain-link fallback below the CTA', async () => {
    await createInvite(inviteEmail, 'user', 1);
    const raw = await delivered();
    expect(raw).toContain('Plain link:');
    expect(raw).toContain('https://lemedia.test/invite?token=');
  });
});

describe('reset email content', () => {
  it('uses the urgency subject with expiry', async () => {
    await requestReset(resetEmail);
    const raw = await delivered();
    const subject = /^Subject: (.*)$/m.exec(raw)?.[1] ?? '';
    expect(subject).toContain('this link ends in 1 hour');
  });

  it('escapes the display name in HTML', async () => {
    await requestReset(resetEmail);
    const raw = await delivered();
    const html = raw.slice(raw.indexOf('<!doctype'));
    expect(raw).toContain('<!doctype');
    expect(html).not.toContain(EVIL_NAME);
    expect(html).toContain('O&quot;Brien &amp; Sons');
  });
});

describe('delivered mail headers', () => {
  it('carries List-Unsubscribe and Reply-To', async () => {
    await requestReset(resetEmail);
    const raw = await delivered();
    expect(raw).toContain('List-Unsubscribe:');
    expect(raw).toContain('Reply-To:');
  });
});
