import { Metadata } from "next";
import { ListsPageClient } from "@/components/Lists";
import { ListsPageHero } from "@/components/Lists/ListsPageHero";
import { getImageProxyEnabled } from "@/lib/app-settings";

export const metadata: Metadata = {
  title: "My Lists - LeMedia",
  description: "Manage your custom movie and TV show lists",
};

export default async function ListsPage() {
  const imageProxyEnabled = await getImageProxyEnabled();

  return (
    <>
      {/* Full-width hero header with client-side interactivity */}
      <ListsPageHero />

      {/* List grid container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-8">
        <ListsPageClient imageProxyEnabled={imageProxyEnabled} />
      </div>
    </>
  );
}
