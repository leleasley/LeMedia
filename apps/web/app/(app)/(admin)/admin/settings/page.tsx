import { permanentRedirect } from "next/navigation";

export default function AdminSettingsIndexPage() {
    permanentRedirect("/admin/settings/general");
}
