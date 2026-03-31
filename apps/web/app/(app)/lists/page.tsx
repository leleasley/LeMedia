import { Metadata } from "next";
import { ListsPageClient } from "@/components/Lists";
import { getImageProxyEnabled } from "@/lib/app-settings";

export const metadata: Metadata = {
  title: "My Lists - LeMedia",
  description: "Manage your custom movie and TV show lists",
};

export default async function ListsPage() {
  const imageProxyEnabled = await getImageProxyEnabled();

  return <ListsPageClient imageProxyEnabled={imageProxyEnabled} />;
}
