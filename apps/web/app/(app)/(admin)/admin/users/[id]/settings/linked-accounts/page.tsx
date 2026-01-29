import { LinkedAccountsPanel } from "@/components/LinkedAccounts/LinkedAccountsPanel";

export const metadata = {
    title: "Linked Accounts - User settings - LeMedia",
};

export default async function UserLinkedAccountsPage({
    params
}: {
    params: { id: string } | Promise<{ id: string }>;
}) {
    const resolvedParams = await Promise.resolve(params);
    return <LinkedAccountsPanel mode="admin" userId={resolvedParams.id} />;
}
