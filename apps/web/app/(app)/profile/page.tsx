import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { getUserWithHash, listNotificationEndpoints, listUserNotificationEndpointIds } from "@/db";
import { ProfilePageClient } from "@/components/Profile/ProfilePageClient";

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
  const groups = dbUser.groups ?? [];
  const isAdmin = groups.includes("admin") || user.isAdmin;

  return (
    <ProfilePageClient
      user={{
        username: user.username,
        email: dbUser.email,
        avatarUrl: dbUser.avatar_url,
        jellyfinUserId: dbUser.jellyfin_user_id,
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
