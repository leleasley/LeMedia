import { z } from "zod";

export const notificationTypeSchema = z.enum([
  "email",
  "discord",
  "telegram",
  "webhook",
  "webpush",
  "gotify",
  "ntfy",
  "pushbullet",
  "pushover",
  "slack"
]);

export type NotificationType = z.infer<typeof notificationTypeSchema>;
