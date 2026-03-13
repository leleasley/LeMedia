import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Cloud, Link2, Mail, ShieldAlert } from "lucide-react";
import { getUser } from "@/auth";
import { listNotificationEndpointsFull } from "@/db";
import { ADMIN_NOTIFICATION_PROVIDERS } from "@/lib/notification-providers";

export const metadata = {
    title: "Global Channels - Admin Settings",
};

function ProviderIcon({
    provider,
}: {
    provider: (typeof ADMIN_NOTIFICATION_PROVIDERS)[number];
}) {
    if (provider.iconKind === "image" && provider.iconPath) {
        return (
            <Image
                src={provider.iconPath}
                alt={provider.iconAlt}
                width={20}
                height={20}
                className="h-5 w-5 brightness-0 invert"
            />
        );
    }

    if (provider.iconKind === "mail") {
        return <Mail className="h-5 w-5" strokeWidth={1.9} />;
    }

    if (provider.iconKind === "webpush") {
        return <Cloud className="h-5 w-5" strokeWidth={1.9} />;
    }

    return <Link2 className="h-5 w-5" strokeWidth={1.9} />;
}

export default async function AdminSettingsNotificationsPage() {
    const user = await getUser().catch(() => null);
    if (!user) redirect("/login");
    if (!user.isAdmin) {
        return (
            <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl p-8">
                <div className="text-lg font-bold text-white">Forbidden</div>
                <div className="mt-2 text-sm text-white/50">You&apos;re not in the admin group.</div>
            </div>
        );
    }

    const allEndpoints = await listNotificationEndpointsFull();
    const globalChannels = allEndpoints.filter((endpoint) => endpoint.is_global && endpoint.owner_user_id == null);
    const enabledGlobalChannels = globalChannels.filter((endpoint) => endpoint.enabled);
    const providerCounts = new Map<string, number>();

    for (const endpoint of globalChannels) {
        providerCounts.set(endpoint.type, (providerCounts.get(endpoint.type) ?? 0) + 1);
    }

    return (
        <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.9)] backdrop-blur-sm md:p-6">
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-40" />
                    <div className="relative inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
                        Global Channels Overview
                    </div>
                    <h2 className="relative mt-3 text-2xl font-bold text-white">Shared delivery lives here.</h2>
                    <p className="relative mt-3 max-w-3xl text-sm leading-6 text-white/70">
                        Configure the shared provider endpoints used for requests, issues, releases, and any routed system alerts. Personal user-owned channels stay on the profile side and do not belong in this admin surface.
                    </p>

                    <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Global channels</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{globalChannels.length}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Enabled</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{enabledGlobalChannels.length}</div>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                            <div className="text-[11px] uppercase tracking-[0.2em] text-white/40">Providers in use</div>
                            <div className="mt-2 text-2xl font-semibold text-white">{providerCounts.size}</div>
                        </div>
                    </div>
                </div>

                <Link
                    href="/admin/settings/notifications/system-alerts"
                    className="group rounded-2xl border border-amber-300/20 bg-[linear-gradient(135deg,rgba(120,53,15,0.28),rgba(15,23,42,0.92),rgba(2,6,23,0.95))] p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.9)] transition hover:border-amber-300/35 md:p-6"
                >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/25 text-white">
                        <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className="mt-5 text-sm font-semibold uppercase tracking-[0.22em] text-amber-100/80">System Alerts</div>
                    <div className="mt-2 text-xl font-bold text-white">Route health and outage alerts.</div>
                    <p className="mt-3 text-sm leading-6 text-slate-300">
                        Decide who receives operational alerts and whether routing uses target users, global endpoints, or both.
                    </p>
                    <div className="mt-5 inline-flex items-center rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-50">
                        Open System Alerts
                    </div>
                </Link>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-5 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.9)] backdrop-blur-sm md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/50">Providers</div>
                        <h3 className="mt-2 text-xl font-bold text-white">Manage shared provider endpoints</h3>
                    </div>
                    <div className="text-sm text-white/60">Pick a provider to create, edit, test, or prune global channels.</div>
                </div>

                <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {ADMIN_NOTIFICATION_PROVIDERS.map((provider) => {
                        const configuredCount = providerCounts.get(provider.type) ?? 0;

                        return (
                            <Link
                                key={provider.type}
                                href={provider.adminPath}
                                className={`rounded-xl border border-white/10 bg-gradient-to-br ${provider.accent} p-4 transition hover:border-white/20`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 text-white">
                                        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20">
                                            <ProviderIcon provider={provider} />
                                        </span>
                                        <div>
                                            <div className="text-base font-semibold">{provider.label}</div>
                                            <div className="text-xs uppercase tracking-[0.22em] text-slate-300/70">Global provider</div>
                                        </div>
                                    </div>
                                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs font-semibold text-white">
                                        {configuredCount}
                                    </span>
                                </div>

                                <p className="mt-4 text-sm leading-6 text-slate-200/85">{provider.description}</p>

                                <div className="mt-4 inline-flex items-center rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-slate-100">
                                    Manage {provider.label}
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
