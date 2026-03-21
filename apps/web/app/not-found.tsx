import Link from "next/link";
import { Home, RefreshCcw } from "lucide-react";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(56,189,248,0.14),transparent_40%),radial-gradient(circle_at_78%_82%,rgba(239,68,68,0.12),transparent_45%),linear-gradient(145deg,rgba(15,23,42,0.95),rgba(17,24,39,0.98))]" />

      <div className="relative z-10 glass-strong w-full max-w-2xl rounded-2xl border border-white/10 p-6 text-center shadow-2xl md:p-10 animate-in fade-in zoom-in duration-300">
        <div className="mx-auto mb-7 w-fit">
          <div className="relative mx-auto h-44 w-64 md:h-52 md:w-80">
            <div className="absolute inset-0 rounded-2xl border-2 border-slate-300/40 bg-slate-700/30 shadow-[0_0_35px_rgba(15,23,42,0.7)]" />
            <div className="absolute inset-3 overflow-hidden rounded-lg border border-slate-400/20 bg-slate-950">
              <div className="absolute inset-0 opacity-35 [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.18),rgba(255,255,255,0.18)_2px,transparent_2px,transparent_6px)]" />
              <div className="absolute inset-0 bg-gradient-to-b from-cyan-400/10 via-white/5 to-red-400/10" />
              <div className="absolute left-4 right-4 top-1/2 h-px -translate-y-1/2 bg-cyan-300/80 shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="select-none text-2xl font-black tracking-[0.38em] text-cyan-100/85 md:text-3xl">SIGNAL LOST</span>
              </div>
            </div>
            <div className="absolute -bottom-2 left-8 h-3 w-16 -rotate-6 rounded-full bg-slate-500/70" />
            <div className="absolute -bottom-2 right-8 h-3 w-16 rotate-6 rounded-full bg-slate-500/70" />
            <div className="absolute -right-2 top-16 h-10 w-2 rounded bg-slate-400/60" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-text md:text-4xl">Page Not Found</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
          The page you requested is off-air right now. We could not find that route.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/" className="btn btn-primary gap-2 px-7 py-3 text-sm md:text-base">
            <Home className="h-4 w-4" />
            Back Home
          </Link>
          <Link href="/login" className="btn gap-2 px-7 py-3 text-sm md:text-base">
            <RefreshCcw className="h-4 w-4" />
            Go to Login
          </Link>
        </div>
      </div>
    </main>
  );
}
