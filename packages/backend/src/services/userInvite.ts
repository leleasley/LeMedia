import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import { hashPassword } from '../utils/password.js';
import { validatePasswordStrength } from '../utils/passwordStrength.js';
import { getAppSettings } from '../utils/appSettings.js';
import { isMailReady, sendMail } from './mailer.js';
import { buildEmailHtml, escapeHtml } from './emailLayout.js';
import { logEvent } from '../utils/logEvent.js';

const TOKEN_BYTES = 32;
const TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function inviteEmail(siteName: string, siteUrl: string | null, link: string, email: string) {
  const safeSite = escapeHtml(siteName);
  const safeEmail = escapeHtml(email);
  const html = buildEmailHtml({
    siteName,
    siteUrl,
    title: 'You have been invited',
    preheader: `Set your password in 2 minutes, invite ends in 24 hours`,
    bodyHtml: `<p style="margin:0 0 12px">You have been invited to create an account on <strong>${safeSite}</strong> for <strong>${safeEmail}</strong>.</p><p style="margin:0 0 12px">This invitation expires in 24 hours. Click below to set your password and activate your account.</p>`,
    cta: { label: 'Create your account', href: link },
    footerNote: `If you weren't expecting this, you can ignore this email.`,
  });
  return {
    subject: `Your ${siteName} invite ends tomorrow, claim it in 2 minutes`,
    text: [
      `You've been invited to join ${siteName}.`,
      '',
      `Email: ${email}`,
      `Create your account here (expires in 24 hours):`,
      link,
      '',
      `If you weren't expecting this, ignore this email.`,
    ].join('\n'),
    html,
  };
}

export type InviteError = 'EMAIL_EXISTS' | 'MAIL_NOT_READY' | 'SITE_URL_MISSING' | 'INVALID_EMAIL' | 'RATE_LIMITED' | 'EMAIL_DELIVERY_FAILED';

export type InviteResult = { token: string } | { error: InviteError; detail?: string };

function isRecipientError(msg: string): boolean {
  return /recipient|550|551|552|553|554|5\.1\.1|5\.1\.2|5\.1\.3|no such user|user unknown|mailbox unavailable|invalid.*mailbox|undeliverable|does not exist|address.*not found|bad destination/i.test(msg);
}

export async function createInvite(emailRaw: string, role: string, invitedBy: number): Promise<InviteResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'INVALID_EMAIL' };

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return { error: 'EMAIL_EXISTS' };

  const settings = await getAppSettings();
  const siteName = settings?.siteName || 'LeMedia';
  const base = settings?.siteUrl?.trim().replace(/\/+$/, '');
  if (!base) return { error: 'SITE_URL_MISSING' };
  if (!(await isMailReady())) return { error: 'MAIL_NOT_READY' };

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashToken(token);

  // Invalidate previous pending invites for this email
  await prisma.userInvite.deleteMany({ where: { email, acceptedAt: null } });
  await prisma.userInvite.create({
    data: {
      email,
      tokenHash,
      role: role || 'user',
      invitedBy,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  const link = `${base}/invite?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({ to: email, ...inviteEmail(siteName, base, link, email) });
    logEvent('info', 'Invite', `Invite sent to ${email} by ${invitedBy} via ${base}`);
  } catch (err) {
    // Roll back invite if mail fails so admin sees error and can retry
    await prisma.userInvite.delete({ where: { tokenHash } }).catch(() => {});
    const msg = (err as Error).message || '';
    logEvent('warn', 'Invite', `Invite mail failed for ${email}: ${msg}`);
    if (isRecipientError(msg)) {
      return { error: 'EMAIL_DELIVERY_FAILED', detail: msg };
    }
    return { error: 'MAIL_NOT_READY', detail: msg };
  }

  return { token };
}

export async function resendInvite(inviteId: number, invitedBy: number): Promise<{ error?: InviteError; detail?: string }> {
  const existing = await prisma.userInvite.findUnique({ where: { id: inviteId } });
  if (!existing) return { error: 'INVALID_EMAIL' };
  if (existing.acceptedAt) return { error: 'INVALID_EMAIL' };

  // Only allow resend if expired
  if (existing.expiresAt.getTime() > Date.now()) {
    // Still valid - treat as already sent, but allow resend anyway? Spec says if expired allow resend
    return { error: 'RATE_LIMITED' };
  }

  const email = existing.email;
  const checkUser = await prisma.user.findUnique({ where: { email } });
  if (checkUser) {
    await prisma.userInvite.delete({ where: { id: inviteId } }).catch(() => {});
    return { error: 'EMAIL_EXISTS' };
  }

  const settings = await getAppSettings();
  const siteName = settings?.siteName || 'LeMedia';
  const base = settings?.siteUrl?.trim().replace(/\/+$/, '');
  if (!base) return { error: 'SITE_URL_MISSING' };
  if (!(await isMailReady())) return { error: 'MAIL_NOT_READY' };

  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = hashToken(token);

  await prisma.userInvite.update({
    where: { id: inviteId },
    data: { tokenHash, expiresAt: new Date(Date.now() + TTL_MS), createdAt: new Date() },
  });

  const link = `${base}/invite?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({ to: email, ...inviteEmail(siteName, base, link, email) });
    logEvent('info', 'Invite', `Invite resent to ${email} by ${invitedBy}`);
  } catch (err) {
    const msg = (err as Error).message || '';
    logEvent('warn', 'Invite', `Invite resend failed for ${email}: ${msg}`);
    if (isRecipientError(msg)) return { error: 'EMAIL_DELIVERY_FAILED', detail: msg };
    return { error: 'MAIL_NOT_READY', detail: msg };
  }
  return {};
}

export async function getInviteByToken(token: string): Promise<{ email: string; expiresAt: Date; role: string } | null> {
  if (!token) return null;
  const row = await prisma.userInvite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return null;
  const expected = Buffer.from(row.tokenHash);
  const actual = Buffer.from(hashToken(token));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (row.acceptedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  // If user was created in the meantime, invalidate
  const userExists = await prisma.user.findUnique({ where: { email: row.email } });
  if (userExists) {
    await prisma.userInvite.update({ where: { id: row.id }, data: { acceptedAt: new Date() } }).catch(() => {});
    return null;
  }
  return { email: row.email, expiresAt: row.expiresAt, role: row.role };
}

export type AcceptError = 'INVALID_TOKEN' | 'EXPIRED' | 'EMAIL_EXISTS' | 'PASSWORD_TOO_SHORT' | 'PASSWORD_WEAK' | 'DISPLAY_NAME_REQUIRED';

export async function acceptInvite(token: string, password: string, displayName?: string): Promise<AcceptError | null> {
  const strength = validatePasswordStrength(password);
  if (!strength.valid) return strength.reason === 'PASSWORD_TOO_SHORT' ? 'PASSWORD_TOO_SHORT' : 'PASSWORD_WEAK';

  const row = await prisma.userInvite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return 'INVALID_TOKEN';

  const expected = Buffer.from(row.tokenHash);
  const actual = Buffer.from(hashToken(token));
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return 'INVALID_TOKEN';

  if (row.acceptedAt) return 'INVALID_TOKEN';
  if (row.expiresAt.getTime() < Date.now()) return 'EXPIRED';

  const existingUser = await prisma.user.findUnique({ where: { email: row.email } });
  if (existingUser) {
    await prisma.userInvite.update({ where: { id: row.id }, data: { acceptedAt: new Date() } }).catch(() => {});
    return 'EMAIL_EXISTS';
  }

  const name = displayName?.trim() || row.email.split('@')[0];
  if (!name) return 'DISPLAY_NAME_REQUIRED';

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.user.create({
      data: {
        email: row.email,
        displayName: name,
        passwordHash,
        role: row.role || 'user',
        providers: { create: { provider: 'email', providerId: row.email, providerUsername: name, providerEmail: row.email } },
      },
    }),
    prisma.userInvite.update({ where: { id: row.id }, data: { acceptedAt: new Date() } }),
  ]);

  logEvent('info', 'Invite', `Invite accepted for ${row.email}`);
  return null;
}

export async function listInvites(): Promise<Array<{ id: number; email: string; role: string; expiresAt: Date; acceptedAt: Date | null; createdAt: Date }>> {
  return prisma.userInvite.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
}

export async function purgeExpiredInvites(): Promise<number> {
  const { count } = await prisma.userInvite.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() }, acceptedAt: { not: null } }] },
  });
  // Keep accepted ones for a short while? Already purged. Expired unaccepted also purged so list stays clean.
  // Actually spec says allow resend if expired, so don't delete expired yet - just keep for resend UI.
  // Let's only purge accepted and very old expired (>7d)
  return count;
}

export async function purgeStaleInvites(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { count } = await prisma.userInvite.deleteMany({
    where: { OR: [{ acceptedAt: { not: null } }, { expiresAt: { lt: cutoff } }] },
  });
  return count;
}
