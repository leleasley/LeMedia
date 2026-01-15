import { ReactNode } from "react";
import { UserSettingsLayoutClient } from "@/components/Settings/Users/UserSettingsLayoutClient";

export default function UserSettingsLayout({ children }: { children: ReactNode }) {
    return <UserSettingsLayoutClient>{children}</UserSettingsLayoutClient>;
}
