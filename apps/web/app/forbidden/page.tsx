import Link from "next/link";

export const metadata = {
  title: "Forbidden - LeMedia",
};
import { ShieldBan, Home } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong rounded-2xl p-8 md:p-12 text-center max-w-lg w-full flex flex-col items-center shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-orange-500/10 p-4 rounded-full mb-6 ring-1 ring-orange-500/20">
          <ShieldBan className="text-orange-500 w-12 h-12 md:w-16 md:h-16" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-text mb-3">Access Denied</h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8 leading-relaxed">
          You don&apos;t have the VIP pass required to view this content.
        </p>
        <Link href="/" className="btn btn-primary gap-2 px-8 py-3 text-base group">
          <Home className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
          Return Home
        </Link>
      </div>
    </main>
  );
}