"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong rounded-2xl p-8 md:p-12 text-center max-w-lg w-full flex flex-col items-center shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-destructive/10 p-4 rounded-full mb-6 ring-1 ring-destructive/20">
          <AlertTriangle className="text-destructive w-12 h-12 md:w-16 md:h-16" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-text mb-3">System Error</h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8 leading-relaxed">
          Something went wrong behind the scenes. We’re working on fixing the glitch.
        </p>
        <button
          onClick={() => reset()}
          className="btn btn-primary gap-2 px-8 py-3 text-base group"
        >
          <RefreshCcw className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500" />
          Try Again
        </button>
      </div>
    </main>
  );
}