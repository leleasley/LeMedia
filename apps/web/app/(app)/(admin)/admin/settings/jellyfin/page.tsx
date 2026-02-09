import { redirect } from "next/navigation";

export default async function AdminSettingsJellyfinRedirect() {
    redirect("/admin/setings/media-servers");
}
