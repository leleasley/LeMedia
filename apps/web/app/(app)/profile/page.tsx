import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { getUserWithHash, listNotificationEndpoints, listUserNotificationEndpointIds } from "@/db";
import { ProfilePageClient } from "@/components/Profile/ProfilePageClient";
import { isAdminGroup, normalizeGroupList } from "@/lib/groups";

export const metadata = {
  title: "Profile - LeMedia",
};

export default async function ProfilePage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) {
    redirect("/login");
  }

  const [endpoints, selectedIds] = await Promise.all([
    listNotificationEndpoints(),
    listUserNotificationEndpointIds(dbUser.id)
  ]);

  const enabledEndpoints = (endpoints as any[]).filter(e => e?.enabled !== false);
  const assignedEndpoints = enabledEndpoints.filter(endpoint => selectedIds.includes(endpoint.id));

  const mfaEnabled = !!dbUser.mfa_secret;
  const groups = normalizeGroupList(dbUser.groups ?? []);
  const isAdmin = user.isAdmin || isAdminGroup(groups);

  return (
    <ProfilePageClient
      user={{
        username: user.username,
        displayName: dbUser.display_name ?? null,
        email: dbUser.email,
        avatarUrl: dbUser.avatar_url,
        avatarVersion: dbUser.avatar_version ?? null,
        jellyfinUserId: dbUser.jellyfin_user_id,
        jellyfinUsername: dbUser.jellyfin_username ?? null,
        traktUsername: dbUser.trakt_username ?? null,
        discordUserId: dbUser.discord_user_id ?? null,
        letterboxdUsername: dbUser.letterboxd_username ?? null,
        createdAt: dbUser.created_at,
        lastSeenAt: dbUser.last_seen_at,
        userId: dbUser.id,
      }}
      mfaEnabled={mfaEnabled}
      isAdmin={isAdmin}
      assignedEndpoints={assignedEndpoints}
    />
  );
}
