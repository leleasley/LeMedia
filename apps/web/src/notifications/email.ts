import nodemailer from "nodemailer";
import { z } from "zod";
import { getNotificationEndpointByType } from "@/lib/notifications";

export type EmailSmtpConfig = {
  smtpHost?: string | null;
  smtpPort?: number | null;
  authUser?: string | null;
  authPass?: string | null;
  secure?: boolean | null;
  requireTls?: boolean | null;
  ignoreTls?: boolean | null;
  allowSelfSigned?: boolean | null;
  senderName?: string | null;
  senderAddress?: string | null;
  emailFrom?: string | null;
  encryption?: "none" | "starttls" | "tls" | "default" | "opportunistic" | "implicit" | null;
};

type NormalizedSmtp = {
  host: string;
  port: number;
  secure: boolean;
  requireTls: boolean;
  ignoreTls: boolean;
  authUser: string;
  authPass: string;
  allowSelfSigned: boolean;
  from: string;
};

const emailSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1),
  text: z.string().min(1),
  html: z.string().optional()
});

let cachedGlobal: { value: NormalizedSmtp | null; expiresAt: number } | null = null;
const CACHE_MS = 60_000;

function normalizeSmtpConfig(raw?: EmailSmtpConfig | null): NormalizedSmtp | null {
  if (!raw) return null;
  const host = String(raw.smtpHost ?? "").trim();
  const port = Number(raw.smtpPort ?? 587);
  if (!host || !Number.isFinite(port) || port <= 0) return null;

  const fromAddress = String(raw.emailFrom ?? raw.senderAddress ?? "").trim();
  const fromName = String(raw.senderName ?? "LeMedia").trim();
  const from = fromAddress ? (fromName ? `"${fromName}" <${fromAddress}>` : fromAddress) : "";

  let secure = Boolean(raw.secure);
  let requireTls = Boolean(raw.requireTls);
  let ignoreTls = Boolean(raw.ignoreTls);
  const encryption = raw.encryption ?? null;
  if (encryption) {
    if (encryption === "tls" || encryption === "implicit") {
      secure = true;
      requireTls = false;
      ignoreTls = false;
    } else if (encryption === "none") {
      secure = false;
      requireTls = false;
      ignoreTls = true;
    } else if (encryption === "opportunistic") {
      secure = false;
      requireTls = true;
      ignoreTls = false;
    } else {
      secure = false;
      requireTls = false;
      ignoreTls = false;
    }
  }

  return {
    host,
    port,
    secure,
    requireTls,
    ignoreTls,
    authUser: String(raw.authUser ?? "").trim(),
    authPass: String(raw.authPass ?? ""),
    allowSelfSigned: Boolean(raw.allowSelfSigned),
    from
  };
}

async function getGlobalSmtpConfig(): Promise<NormalizedSmtp | null> {
  if (cachedGlobal && cachedGlobal.expiresAt > Date.now()) return cachedGlobal.value;
  try {
    const endpoint = await getNotificationEndpointByType("email");
    const normalized = normalizeSmtpConfig(endpoint?.config as EmailSmtpConfig);
    cachedGlobal = { value: normalized, expiresAt: Date.now() + CACHE_MS };
    return normalized;
  } catch {
    cachedGlobal = { value: null, expiresAt: Date.now() + CACHE_MS };
    return null;
  }
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string; smtp?: EmailSmtpConfig }) {
  const validated = emailSchema.parse(input);
  const override = normalizeSmtpConfig(input.smtp);
  const smtp = override ?? (await getGlobalSmtpConfig());

  if (!smtp) {
    throw new Error("SMTP settings are not configured. Save SMTP settings in Email notifications first.");
  }
  if (!smtp.from) {
    throw new Error("SMTP sender address is missing.");
  }

  const auth =
    smtp.authUser && smtp.authPass
      ? { user: smtp.authUser, pass: smtp.authPass }
      : undefined;

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth,
    requireTLS: smtp.requireTls,
    ignoreTLS: smtp.ignoreTls,
    tls: smtp.allowSelfSigned ? { rejectUnauthorized: false } : undefined
  });

  await transporter.sendMail({
    from: smtp.from,
    to: validated.to,
    subject: validated.subject,
    text: validated.text,
    html: validated.html
  });
}
