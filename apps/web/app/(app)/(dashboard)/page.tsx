import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import HomeDashboardClient from "@/components/Dashboard/HomeDashboardClient";

export const metadata = {
  title: "Home - LeMedia",
};

export const revalidate = 0;

export default async function Page() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  return (
    <HomeDashboardClient
      isAdmin={user.isAdmin}
      username={user.username}
      displayName={user.displayName}
    />
  );
}
