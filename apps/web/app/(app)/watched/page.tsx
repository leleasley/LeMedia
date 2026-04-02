import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { MediaListClient } from "@/components/MediaList/MediaListClient";

export const metadata = {
  title: "Watched - LeMedia",
  description: "Movies and TV shows you've watched",
};

export default async function WatchedPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Watched</h1>
        <p className="text-sm text-gray-400">Movies and TV shows you&apos;ve marked as watched</p>
      </div>

      <MediaListClient listType="watched" />
    </div>
  );
}
