import { getUser } from "@/auth";
import AppLayoutClient from "./layout-client";
import "@/lib/webauthn-scheduler"; // Start WebAuthn cleanup scheduler
import { getMediaIssueCounts, getPendingRequestCount, getRequestCounts, getUserWithHash, isSetupComplete } from "@/db";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { getMaintenanceState } from "@/lib/maintenance";
import { withCache } from "@/lib/local-cache";
import webPackageJson from "../../package.json";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Check if setup is required - redirect to setup wizard if not complete
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }
  let isAdmin = false;
  let pendingCount = 0;
  let issuesCount = 0;
  let profile: {
    username: string;
    displayName?: string | null;
    email: string | null;
    avatarUrl?: string | null;
    avatarVersion?: number | null;
    jellyfinUserId?: string | null;
  } | null = null;
  const maintenanceState = await withCache("maintenance_state", 30_000, () => getMaintenanceState());
  const imageProxyEnabled = await withCache("image_proxy_enabled", 60_000, () => getImageProxyEnabled());
  // Prefer the version baked into the image at build time; fall back to package.json
  const appVersion = (process.env.APP_VERSION && process.env.APP_VERSION !== "local")
    ? process.env.APP_VERSION.replace(/^v/, "")
    : (webPackageJson.version ?? "0.1.0");
  const sidebarFooterText = `LeMedia v${appVersion}`;
  try {
    const user = await getUser();
    isAdmin = user.isAdmin;
    const dbUser = await getUserWithHash(user.username);
    if (dbUser) {
      profile = {
        username: dbUser.username,
        displayName: dbUser.display_name ?? null,
        email: dbUser.email ?? null,
        avatarUrl: dbUser.avatar_url ?? null,
        avatarVersion: dbUser.avatar_version ?? null,
        jellyfinUserId: dbUser.jellyfin_user_id ?? null
      };
    }
    if (isAdmin) {
      const [{ requestCounts, issueCounts }, pendingFallback] = await Promise.all([
        withCache("admin_counts", 20_000, async () => {
          const [requestCounts, issueCounts] = await Promise.all([
            getRequestCounts().catch(() => null),
            getMediaIssueCounts().catch(() => null),
          ]);
          return { requestCounts, issueCounts };
        }),
        getPendingRequestCount().catch(() => 0),
      ]);
      pendingCount = requestCounts?.pending ?? pendingFallback;
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
