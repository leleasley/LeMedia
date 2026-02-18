import { Metadata } from "next";
import { PublicProfileClient } from "@/components/Social/PublicProfile/PublicProfileClient";
import { getImageProxyEnabled } from "@/lib/app-settings";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${username}'s Profile - LeMedia`,
    description: `View ${username}'s movie and TV show lists, reviews, and activity on LeMedia.`,
  };
}

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const imageProxyEnabled = await getImageProxyEnabled();

  return (
    <div className="min-h-screen">
      <PublicProfileClient username={username} imageProxyEnabled={imageProxyEnabled} />
    </div>
  );
}
