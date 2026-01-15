import nodemailer from "nodemailer";
import { z } from "zod";

const EnvSchema = z.object({
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().trim().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().trim().min(1),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .default("false")
    .transform(v => v === "true")
});

function resolveEnv() {
  return {
    SMTP_HOST: process.env.SMTP_HOST ?? process.env.EMAIL_SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT ?? process.env.EMAIL_SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER ?? process.env.EMAIL_SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS ?? process.env.EMAIL_SMTP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM ?? process.env.EMAIL_FROM_ADDRESS,
    SMTP_SECURE: process.env.SMTP_SECURE ?? process.env.EMAIL_SMTP_SECURE
  };
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }) {
  const env = EnvSchema.parse(resolveEnv());
  const to = z.string().trim().email().parse(input.to);
  const subject = z.string().trim().min(1).parse(input.subject);
  const text = z.string().min(1).parse(input.text);

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject,
    text,
    html: input.html
  });
}
