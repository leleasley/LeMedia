"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw, Home, Search } from "lucide-react";
import Link from "next/link";

export default function MovieError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Movie Page Error]", error);
  }, [error]);

  const isNotFound = error.message?.includes("not found") || error.message?.includes("404");

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="glass-strong rounded-2xl p-8 md:p-12 text-center max-w-lg w-full flex flex-col items-center shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-destructive/10 p-4 rounded-full mb-6 ring-1 ring-destructive/20">
          <AlertTriangle className="text-destructive w-12 h-12 md:w-16 md:h-16" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-text mb-3">
          {isNotFound ? "Movie Not Found" : "Error Loading Movie"}
        </h1>
        <p className="text-muted-foreground text-base md:text-lg mb-8 leading-relaxed">
          {isNotFound 
            ? "We couldn't find this movie. It may have been removed or the ID is incorrect."
            : "Something went wrong while loading the movie details. Please try again."}
        </p>
        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={() => reset()}
            className="btn btn-primary gap-2 px-6 py-3 text-base group"
          >
            <RefreshCcw className="w-4 h-4 transition-transform group-hover:rotate-180 duration-500" />
            Try Again
          </button>
          <Link href="/search" className="btn btn-secondary gap-2 px-6 py-3 text-base">
            <Search className="w-4 h-4" />
            Search Movies
          </Link>
          <Link href="/" className="btn btn-ghost gap-2 px-6 py-3 text-base">
            <Home className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
