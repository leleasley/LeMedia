export type NotificationProviderType =
  | "telegram"
  | "discord"
  | "slack"
  | "email"
  | "webhook"
  | "gotify"
  | "ntfy"
  | "pushbullet"
  | "pushover"
  | "webpush";

export type NotificationProviderMeta = {
  type: NotificationProviderType;
  label: string;
  iconPath?: string;
  iconAlt: string;
  iconKind: "image" | "mail" | "webhook" | "webpush";
  accent: string;
  description: string;
  adminPath: string;
  supportsPersonal: boolean;
};

const ALL_NOTIFICATION_PROVIDERS: NotificationProviderMeta[] = [
  {
    type: "telegram",
    label: "Telegram",
    iconPath: "/notification-icons/telegram.svg",
    iconAlt: "Telegram",
    iconKind: "image",
    accent: "from-sky-500/25 to-cyan-500/10",
    description: "Shared chat delivery for request, issue, and alert traffic.",
    adminPath: "/admin/settings/notifications/telegram",
    supportsPersonal: true,
  },
  {
    type: "discord",
    label: "Discord",
    iconPath: "/notification-icons/discord.svg",
    iconAlt: "Discord",
    iconKind: "image",
    accent: "from-indigo-500/25 to-blue-500/10",
    description: "Webhook-based delivery for requests, issues, and admin broadcasts.",
    adminPath: "/admin/settings/notifications/discord",
    supportsPersonal: true,
  },
  {
    type: "slack",
    label: "Slack",
    iconPath: "/notification-icons/slack.svg",
    iconAlt: "Slack",
    iconKind: "image",
    accent: "from-lime-500/25 to-emerald-500/10",
    description: "Workspace-ready channel delivery through Slack incoming webhooks.",
    adminPath: "/admin/settings/notifications/slack",
    supportsPersonal: true,
  },
  {
    type: "email",
    label: "Email",
    iconAlt: "Email",
    iconKind: "mail",
    accent: "from-amber-500/25 to-orange-500/10",
    description: "SMTP-backed shared notifications to one or more mailboxes.",
    adminPath: "/admin/settings/notifications/email",
    supportsPersonal: true,
  },
  {
    type: "webhook",
    label: "Webhook",
    iconAlt: "Webhook",
    iconKind: "webhook",
    accent: "from-slate-500/25 to-slate-300/5",
    description: "Structured JSON delivery into your own automation stack.",
    adminPath: "/admin/settings/notifications/webhook",
    supportsPersonal: true,
  },
  {
    type: "gotify",
    label: "Gotify",
    iconPath: "/notification-icons/gotify.svg",
    iconAlt: "Gotify",
    iconKind: "image",
    accent: "from-emerald-500/25 to-teal-500/10",
    description: "Shared push routing through a Gotify instance and app token.",
    adminPath: "/admin/settings/notifications/gotify",
    supportsPersonal: true,
  },
  {
    type: "ntfy",
    label: "ntfy",
    iconPath: "/notification-icons/ntfy.svg",
    iconAlt: "ntfy",
    iconKind: "image",
    accent: "from-fuchsia-500/25 to-pink-500/10",
    description: "Topic-based fanout for shared request and release events.",
    adminPath: "/admin/settings/notifications/ntfy",
    supportsPersonal: true,
  },
  {
    type: "pushbullet",
    label: "Pushbullet",
    iconPath: "/notification-icons/pushbullet.svg",
    iconAlt: "Pushbullet",
    iconKind: "image",
    accent: "from-stone-400/20 to-zinc-300/5",
    description: "Note-style pushes for shared media and operational updates.",
    adminPath: "/admin/settings/notifications/pushbullet",
    supportsPersonal: true,
  },
  {
    type: "pushover",
    label: "Pushover",
    iconPath: "/notification-icons/pushover.svg",
    iconAlt: "Pushover",
    iconKind: "image",
    accent: "from-rose-500/25 to-red-500/10",
    description: "High-signal alert delivery through Pushover application keys.",
    adminPath: "/admin/settings/notifications/pushover",
    supportsPersonal: true,
  },
  {
    type: "webpush",
    label: "Web Push",
    iconAlt: "Web Push",
    iconKind: "webpush",
    accent: "from-cyan-500/25 to-blue-500/10",
    description: "Browser-based shared delivery for on-device alerting.",
    adminPath: "/admin/settings/notifications/webpush",
    supportsPersonal: false,
  },
];

export const ADMIN_NOTIFICATION_PROVIDERS = ALL_NOTIFICATION_PROVIDERS;

export const PERSONAL_NOTIFICATION_PROVIDERS = ALL_NOTIFICATION_PROVIDERS.filter(
  (provider) => provider.supportsPersonal
);

export function getNotificationProviderMeta(type: NotificationProviderType): NotificationProviderMeta {
  return (
    ALL_NOTIFICATION_PROVIDERS.find((provider) => provider.type === type) ?? ALL_NOTIFICATION_PROVIDERS[0]
  );
}