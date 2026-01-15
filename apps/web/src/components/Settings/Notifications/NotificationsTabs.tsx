"use client";

import { usePathname } from "next/navigation";
import { EnvelopeIcon, BoltIcon, CloudIcon } from "@heroicons/react/24/outline";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { cn } from "@/lib/utils";

// SVG Icon components from Jellyseerr
const DiscordIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 71 71" className={className} xmlns="http://www.w3.org/2000/svg">
        <path transform="translate(-1.0994e-7 8.0294)" d="m60.104 4.8978c-4.5253-2.0764-9.378-3.6062-14.452-4.4824-0.0924-0.01691-0.1847 0.025349-0.2323 0.10987-0.6241 1.11-1.3154 2.5581-1.7995 3.6963-5.4572-0.817-10.886-0.817-16.232 0-0.4842-1.1635-1.2006-2.5863-1.8275-3.6963-0.0476-0.0817-0.1399-0.12396-0.2323-0.10987-5.071 0.87338-9.9237 2.4032-14.452 4.4824-0.0392 0.0169-0.0728 0.0451-0.0951 0.0817-9.2046 13.751-11.726 27.165-10.489 40.412 0.005597 0.0648 0.041978 0.1268 0.092353 0.1662 6.0729 4.4598 11.956 7.1673 17.729 8.9619 0.0924 0.0282 0.1903-0.0056 0.2491-0.0817 1.3657-1.865 2.5831-3.8315 3.6269-5.8995 0.0616-0.1211 0.0028-0.2648-0.1231-0.3127-1.931-0.7325-3.7697-1.6256-5.5384-2.6398-0.1399-0.0817-0.1511-0.2818-0.0224-0.3776 0.3722-0.2789 0.7445-0.5691 1.0999-0.8621 0.0643-0.0535 0.1539-0.0648 0.2295-0.031 11.62 5.3051 24.199 5.3051 35.682 0 0.0756-0.0366 0.1652-0.0253 0.2323 0.0282 0.3555 0.293 0.7277 0.586 1.1027 0.8649 0.1287 0.0958 0.1203 0.2959-0.0196 0.3776-1.7687 1.0339-3.6074 1.9073-5.5412 2.637-0.1259 0.0479-0.1819 0.1944-0.1203 0.3155 1.0662 2.0651 2.2836 4.0316 3.6241 5.8967 0.056 0.0789 0.1567 0.1127 0.2491 0.0845 5.8014-1.7946 11.684-4.5021 17.757-8.9619 0.0532-0.0394 0.0868-0.0986 0.0924-0.1634 1.4804-15.315-2.4796-28.618-10.498-40.412-0.0196-0.0394-0.0531-0.0676-0.0923-0.0845zm-36.379 32.428c-3.4983 0-6.3808-3.2117-6.3808-7.156s2.8266-7.156 6.3808-7.156c3.5821 0 6.4367 3.2399 6.3807 7.156 0 3.9443-2.8266 7.156-6.3807 7.156zm23.592 0c-3.4982 0-6.3807-3.2117-6.3807-7.156s2.8265-7.156 6.3807-7.156c3.5822 0 6.4367 3.2399 6.3808 7.156 0 3.9443-2.7986 7.156-6.3808 7.156z" fill="currentColor" />
    </svg>
);

const GotifyIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 71 71" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="m25.05 54.29v-37.58c0-1.379 1.121-2.5 2.5-2.5h16c1.379 0 2.5 1.121 2.5 2.5v37.58c3.83 1.13 6.625 4.67 6.625 8.835 0 5.11-4.14 9.25-9.25 9.25s-9.25-4.14-9.25-9.25c0-4.165 2.795-7.705 6.625-8.835v-8.165h-9.125v8.165c3.83 1.13 6.625 4.67 6.625 8.835 0 5.11-4.14 9.25-9.25 9.25s-9.25-4.14-9.25-9.25c0-4.165 2.795-7.705 6.625-8.835v-8.165h-1.75c-1.379 0-2.5-1.121-2.5-2.5v-20c0-1.379 1.121-2.5 2.5-2.5h16c1.379 0 2.5 1.121 2.5 2.5v3h-9.5v-0.5c0-0.828-0.672-1.5-1.5-1.5h-11c-0.828 0-1.5 0.672-1.5 1.5v15c0 0.828 0.672 1.5 1.5 1.5h11c0.828 0 1.5-0.672 1.5-1.5v-0.5h9.5v16h-9.5v-0.5c0-0.828-0.672-1.5-1.5-1.5h-11c-0.828 0-1.5 0.672-1.5 1.5v3c0 0.828 0.672 1.5 1.5 1.5h1.75v8.165c3.83 1.13 6.625 4.67 6.625 8.835 0 5.11-4.14 9.25-9.25 9.25s-9.25-4.14-9.25-9.25c0-4.165 2.795-7.705 6.625-8.835z" fill="currentColor" />
    </svg>
);

const NtfyIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 71 71" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="m35.5 14.21c-11.77 0-21.29 9.52-21.29 21.29s9.52 21.29 21.29 21.29 21.29-9.52 21.29-21.29-9.52-21.29-21.29-21.29zm0 4.25c9.42 0 17.04 7.62 17.04 17.04s-7.62 17.04-17.04 17.04-17.04-7.62-17.04-17.04 7.62-17.04 17.04-17.04zm0 4.25c-7.08 0-12.79 5.71-12.79 12.79s5.71 12.79 12.79 12.79 12.79-5.71 12.79-12.79-5.71-12.79-12.79-12.79zm0 4.25c4.73 0 8.54 3.81 8.54 8.54s-3.81 8.54-8.54 8.54-8.54-3.81-8.54-8.54 3.81-8.54 8.54-8.54z" fill="currentColor" />
    </svg>
);

const PushbulletIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 71 71" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="m35.5 14.21c-11.77 0-21.29 9.52-21.29 21.29s9.52 21.29 21.29 21.29 21.29-9.52 21.29-21.29-9.52-21.29-21.29-21.29zm0 4.25c9.42 0 17.04 7.62 17.04 17.04s-7.62 17.04-17.04 17.04-17.04-7.62-17.04-17.04 7.62-17.04 17.04-17.04zm-8.54 8.54v17.04h4.25v-8.54h4.29c2.35 0 4.25-1.9 4.25-4.25s-1.9-4.25-4.25-4.25h-8.54zm4.25 4.25h4.29v4.25h-4.29v-4.25z" fill="currentColor" />
    </svg>
);

const PushoverIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 71 71" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="m35.5 14.21c-11.77 0-21.29 9.52-21.29 21.29s9.52 21.29 21.29 21.29 21.29-9.52 21.29-21.29-9.52-21.29-21.29-21.29zm0 4.25c9.42 0 17.04 7.62 17.04 17.04s-7.62 17.04-17.04 17.04-17.04-7.62-17.04-17.04 7.62-17.04 17.04-17.04zm-8.54 8.54v17.04h4.25v-4.25h4.29c2.35 0 4.25-1.9 4.25-4.25v-4.29c0-2.35-1.9-4.25-4.25-4.25h-8.54zm4.25 4.25h4.29v4.25h-4.29v-4.25z" fill="currentColor" />
    </svg>
);

const SlackIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 71 71" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="m24.84 35.5c0 2.36-1.9 4.26-4.26 4.26s-4.26-1.9-4.26-4.26 1.9-4.26 4.26-4.26h4.26v4.26zm2.13 0c0-2.36 1.9-4.26 4.26-4.26s4.26 1.9 4.26 4.26v10.66c0 2.36-1.9 4.26-4.26 4.26s-4.26-1.9-4.26-4.26v-10.66zm4.26-14.21c-2.36 0-4.26-1.9-4.26-4.26s1.9-4.26 4.26-4.26 4.26 1.9 4.26 4.26v4.26h-4.26zm0 2.13c2.36 0 4.26 1.9 4.26 4.26s-1.9 4.26-4.26 4.26h-10.66c-2.36 0-4.26-1.9-4.26-4.26s1.9-4.26 4.26-4.26h10.66zm14.21 4.26c0-2.36 1.9-4.26 4.26-4.26s4.26 1.9 4.26 4.26-1.9 4.26-4.26 4.26h-4.26v-4.26zm-2.13 0c0 2.36-1.9 4.26-4.26 4.26s-4.26-1.9-4.26-4.26v-10.66c0-2.36 1.9-4.26 4.26-4.26s4.26 1.9 4.26 4.26v10.66zm-4.26 14.21c2.36 0 4.26 1.9 4.26 4.26s-1.9 4.26-4.26 4.26-4.26-1.9-4.26-4.26v-4.26h4.26zm0-2.13c-2.36 0-4.26-1.9-4.26-4.26s1.9-4.26 4.26-4.26h10.66c2.36 0 4.26 1.9 4.26 4.26s-1.9 4.26-4.26 4.26h-10.66z" fill="currentColor" />
    </svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 71 71" className={className} xmlns="http://www.w3.org/2000/svg">
        <path d="m13.36 34.96 12.74 4.77 4.94 15.92c0.31 1.01 1.57 1.36 2.37 0.66l5.67-4.95c0.71-0.62 1.73-0.68 2.51-0.15l12.44 9.03c0.93 0.68 2.23 0.08 2.42-1.11l8.74-54.93c0.22-1.37-1.13-2.47-2.4-1.96l-52.64 20.85c-1.42 0.56-1.4 2.6 0.03 3.13zm15.55 1.83 26.97-16.57c0.51-0.31 1.05 0.37 0.6 0.76l-22.36 19.45c-0.74 0.65-1.23 1.54-1.38 2.52l-0.74 4.87c-0.09 0.62-0.97 0.7-1.17 0.11l-2.51-8.22c-0.32-1.05 0.07-2.19 0.98-2.87z" fill="currentColor" />
    </svg>
);

// Import SVG logos
const notificationTypes = [
    {
        id: "email",
        label: "Email",
        icon: EnvelopeIcon,
        path: "/admin/settings/notifications/email",
    },
    {
        id: "webpush",
        label: "Web Push",
        icon: CloudIcon,
        path: "/admin/settings/notifications/webpush",
    },
    {
        id: "discord",
        label: "Discord",
        icon: DiscordIcon,
        path: "/admin/settings/notifications/discord",
    },
    {
        id: "gotify",
        label: "Gotify",
        icon: GotifyIcon,
        path: "/admin/settings/notifications/gotify",
    },
    {
        id: "ntfy",
        label: "ntfy.sh",
        icon: NtfyIcon,
        path: "/admin/settings/notifications/ntfy",
    },
    {
        id: "pushbullet",
        label: "Pushbullet",
        icon: PushbulletIcon,
        path: "/admin/settings/notifications/pushbullet",
    },
    {
        id: "pushover",
        label: "Pushover",
        icon: PushoverIcon,
        path: "/admin/settings/notifications/pushover",
    },
    {
        id: "slack",
        label: "Slack",
        icon: SlackIcon,
        path: "/admin/settings/notifications/slack",
    },
    {
        id: "telegram",
        label: "Telegram",
        icon: TelegramIcon,
        path: "/admin/settings/notifications/telegram",
    },
    {
        id: "webhook",
        label: "Webhook",
        icon: BoltIcon,
        path: "/admin/settings/notifications/webhook",
    },
];

export function NotificationsTabs() {
    const pathname = usePathname();

    return (
        <div className="mb-6">
            <div
                className=""
                role="tablist"
                aria-label="Notification agents"
            >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-wrap">
                {notificationTypes.map((type) => {
                    const isActive = pathname?.includes(type.path);
                    const Icon = type.icon;

                    return (
                        <PrefetchLink
                            key={type.id}
                            href={type.path}
                            className={cn(
                                "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                                isActive
                                    ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50"
                                    : "bg-white/5 text-muted hover:bg-white/10 hover:text-white"
                            )}
                            aria-current={isActive ? "page" : undefined}
                            role="tab"
                        >
                            {Icon && <Icon className="h-4 w-4" />}
                            <span>{type.label}</span>
                        </PrefetchLink>
                    );
                })}
                </div>
            </div>
        </div>
    );
}
