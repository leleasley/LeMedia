import Link from "next/link";

export const metadata = {
  title: "CSRF Error - LeMedia",
};
import { ShieldAlert, LogIn, ArrowLeft } from "lucide-react";

export default function CsrfErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong rounded-2xl p-8 md:p-12 text-center max-w-lg w-full flex flex-col items-center shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-destructive/10 p-4 rounded-full mb-6 ring-1 ring-destructive/20">
          <ShieldAlert className="text-destructive w-12 h-12 md:w-16 md:h-16" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-text mb-3">Security Check Failed</h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8 leading-relaxed">
          We couldn&apos;t verify your session. This usually happens when a page has been open for too long.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <Link href="/login" className="btn btn-primary gap-2 px-6 py-3 text-base group w-full sm:w-auto">
            <LogIn className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            Sign In Again
          </Link>
          <Link href="/" className="btn btn-ghost gap-2 px-6 py-3 text-base group w-full sm:w-auto">
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Go Home
          </Link>
        </div>
      </div>
    </main>
  );
}