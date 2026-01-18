import { redirect } from "next/navigation";

export const metadata = {
  title: "Request Settings - LeMedia",
};

export default async function AdminRequestsPage() {
  // Redirect to the new All Requests page
  redirect("/admin/requests");
}
