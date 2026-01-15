import { getUser } from "@/auth";
import AppLayoutClient from "./layout-client";
import { getImageProxyEnabled } from "@/lib/app-settings";

export default async function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
    const user = await getUser().catch(() => null);
    const imageProxyEnabled = await getImageProxyEnabled();
    return (
        <AppLayoutClient isAdmin={user?.isAdmin ?? false} imageProxyEnabled={imageProxyEnabled}>
            {children}
        </AppLayoutClient>
    );
}
