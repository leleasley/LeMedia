import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { ReviewsPageClient } from "@/components/Reviews/ReviewsPageClient";

export const metadata = {
  title: "Reviews - LeMedia",
};

export default async function ReviewsPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const imageProxyEnabled = await getImageProxyEnabled();

  return <ReviewsPageClient imageProxyEnabled={imageProxyEnabled} />;
}
