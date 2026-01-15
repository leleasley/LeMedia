import { getUser } from "@/auth";
import AppLayoutClient from "./layout-client";
import { startJobScheduler } from "@/lib/jobs";
import "@/lib/webauthn-scheduler"; // Start WebAuthn cleanup scheduler
import { getMediaIssueCounts, getPendingRequestCount, getRequestCounts, getUserWithHash, getSetting } from "@/db";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { getMaintenanceState } from "@/lib/maintenance";

startJobScheduler();

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let isAdmin = false;
  let pendingCount = 0;
  let issuesCount = 0;
  let profile: {
    username: string;
    email: string | null;
    avatarUrl?: string | null;
    jellyfinUserId?: string | null;
  } | null = null;
  const maintenanceState = await getMaintenanceState();
  const imageProxyEnabled = await getImageProxyEnabled();
  const sidebarFooterText = (await getSetting("sidebar_footer_text")) || "LeMedia v0.1.0";
  try {
    const user = await getUser();
    isAdmin = user.isAdmin;
    const dbUser = await getUserWithHash(user.username);
    if (dbUser) {
      profile = {
        username: dbUser.username,
        email: dbUser.email ?? null,
        avatarUrl: dbUser.avatar_url ?? null,
        jellyfinUserId: dbUser.jellyfin_user_id ?? null
      };
    }
    if (isAdmin) {
      const [requestCounts, issueCounts] = await Promise.all([
        getRequestCounts().catch(() => null),
        getMediaIssueCounts().catch(() => null),
      ]);
      pendingCount = requestCounts?.pending ?? (await getPendingRequestCount().catch(() => 0));
      issuesCount = issueCounts?.open ?? 0;
    }
  } catch {
    // Not authenticated or DB error
  }

  return (
    <AppLayoutClient
      isAdmin={isAdmin}
      pendingRequestsCount={pendingCount}
      issuesCount={issuesCount}
      profile={profile}
      imageProxyEnabled={imageProxyEnabled}
      maintenance={maintenanceState}
      sidebarFooterText={sidebarFooterText}
    >
      {children}
    </AppLayoutClient>
  );
}
