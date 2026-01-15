import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong rounded-2xl p-8 md:p-12 text-center max-w-lg w-full flex flex-col items-center shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-accent p-4 rounded-full mb-6 ring-1 ring-border/50">
          <FileQuestion className="text-primary w-12 h-12 md:w-16 md:h-16" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-text mb-3">Page Not Found</h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8 leading-relaxed">
          The scene you’re looking for seems to have been cut from the final edit.
        </p>
        <Link href="/" className="btn btn-primary gap-2 px-8 py-3 text-base group">
          <Home className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
          Back to Home
        </Link>
      </div>
    </main>
  );
}