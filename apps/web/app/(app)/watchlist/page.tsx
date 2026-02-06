import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { MediaListClient } from "@/components/MediaList/MediaListClient";
import { WatchlistSyncButton } from "@/components/Watchlist/WatchlistSyncButton";

export const metadata = {
  title: "My Watchlist - LeMedia",
};

export default async function WatchlistPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">My Watchlist</h1>
        <p className="text-sm text-gray-400">Movies and TV shows you want to watch</p>
      </div>

      <div className="mb-6">
        <WatchlistSyncButton />
      </div>
      
      <MediaListClient listType="watchlist" />
    </div>
  );
}
