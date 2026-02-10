import { redirect } from "next/navigation";
import { ProfileSettingsPageClient } from "@/components/Profile/ProfileSettingsPageClient";
import { getUser } from "@/auth";
import { getUserWithHash, listNotificationEndpoints, listUserNotificationEndpointIds } from "@/db";
import { isAdminGroup, normalizeGroupList } from "@/lib/groups";

const tabs = ["general", "security", "linked", "notifications", "permissions", "password"] as const;
type ActiveTab = Exclude<(typeof tabs)[number], "password">;

export const metadata = {
  title: "Profile Settings - LeMedia",
};

export default async function ProfileSettingsTabPage({
  params
}: {
  params: { tab: string } | Promise<{ tab: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const requestedTab = String(resolvedParams.tab || "");
  if (!tabs.includes(requestedTab as (typeof tabs)[number])) {
    redirect("/settings/profile/general");
  }
  if (requestedTab === "password") {
    redirect("/settings/profile/security");
  }
  const normalizedTab = (requestedTab === "password" ? "security" : requestedTab) as ActiveTab;

  const [dbUser, endpoints] = await Promise.all([
    getUserWithHash(user.username),
    listNotificationEndpoints()
  ]);

  const selectedIds = dbUser ? await listUserNotificationEndpointIds(dbUser.id) : [];
  const enabledEndpoints = (endpoints as any[]).filter(e => e?.enabled !== false);
  const assignedEndpoints = enabledEndpoints.filter(endpoint => selectedIds.includes(endpoint.id));
  const mfaEnabled = !!dbUser?.mfa_secret;
  const groups = normalizeGroupList(dbUser?.groups ?? []);
  const isAdmin = user.isAdmin || isAdminGroup(groups);
  return (
    <ProfileSettingsPageClient
      user={{
        username: user.username,
        displayName: dbUser?.display_name ?? null,
        email: dbUser?.email,
        avatarUrl: dbUser?.avatar_url,
        avatarVersion: dbUser?.avatar_version ?? null,
        jellyfinUserId: dbUser?.jellyfin_user_id,
        createdAt: dbUser?.created_at,
        userId: dbUser?.id,
        groups,
        weeklyDigestOptIn: dbUser?.weekly_digest_opt_in ?? false
      }}
      isAdmin={isAdmin}
      mfaEnabled={mfaEnabled}
      assignedEndpoints={assignedEndpoints}
      activeTab={normalizedTab}
    />
  );
}
