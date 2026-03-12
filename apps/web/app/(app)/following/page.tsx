import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { FollowingPageClient } from "@/components/Following/FollowingPageClient";

export const metadata = {
  title: "Following - LeMedia",
};

export default async function FollowingPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  return <FollowingPageClient />;
}
