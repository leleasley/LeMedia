import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { ProfileSettingsShellClient } from "@/components/Profile/ProfileSettingsShellClient";

export default async function ProfileSettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) {
    redirect("/login");
  }

  const groups = dbUser.groups ?? [];
  const isAdmin = groups.includes("admin") || user.isAdmin;

  return (
    <ProfileSettingsShellClient
      user={{
        username: user.username,
        email: dbUser.email,
        avatarUrl: dbUser.avatar_url,
        jellyfinUserId: dbUser.jellyfin_user_id,
        createdAt: dbUser.created_at,
        userId: dbUser.id,
        groups
      }}
      isAdmin={isAdmin}
    >
      {children}
    </ProfileSettingsShellClient>
  );
}
