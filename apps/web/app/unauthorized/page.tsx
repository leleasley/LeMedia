import Link from "next/link";

export const metadata = {
  title: "Unauthorized - LeMedia",
};

export default function UnauthorizedPage({ searchParams }: { searchParams: { from?: string } }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="bg-surface-strong border border-border rounded-lg shadow-lg mx-auto max-w-xl p-6">
        <h1 className="text-xl font-bold text-text">Unauthorized</h1>
        <p className="mt-2 text-sm text-muted">
          You’re not signed in, or your session has expired.
        </p>
        <p className="mt-4 text-sm text-muted">
          Path attempted: <span className="text-text">{searchParams?.from ?? "/"}</span>
        </p>
        <div className="mt-5 flex gap-3">
          <Link className="btn" href="/login">
            Go to login
          </Link>
        </div>
      </div>
    </main>
  );
}
