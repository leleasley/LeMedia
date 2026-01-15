import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { MediaListClient } from "@/components/MediaList/MediaListClient";

export const metadata = {
  title: "My Favorites - LeMedia",
};

export default async function FavoritesPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">My Favorites</h1>
        <p className="text-sm text-gray-400">Your favorite movies and TV shows</p>
      </div>
      
      <MediaListClient listType="favorite" />
    </div>
  );
}
