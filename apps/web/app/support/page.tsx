import Link from "next/link";

export const metadata = {
  title: "Support - LeMedia",
};

export default function SupportPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="bg-surface-strong border border-border rounded-lg shadow-lg mx-auto max-w-xl p-6">
        <h1 className="text-xl font-bold text-text">Support</h1>
        <p className="mt-2 text-sm text-muted">
          Need help signing in? Contact an administrator to reset your password or access.
        </p>
        <p className="mt-4 text-sm text-muted">
          If you’re not sure who to contact, use the same channel you were invited from.
        </p>
        <div className="mt-5 flex gap-3">
          <Link className="btn" href="/login">
            Back to login
          </Link>
        </div>
      </div>
    </main>
  );
}
