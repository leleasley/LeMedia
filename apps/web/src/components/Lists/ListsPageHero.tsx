"use client";

import { Plus } from "lucide-react";

export function ListsPageHero() {
  const handleCreateClick = () => {
    // Dispatch a custom event that ListsPageClient will listen for
    window.dispatchEvent(new CustomEvent('openCreateListModal'));
  };

  return (
    <div className="w-full bg-gradient-to-b from-blue-900/20 via-blue-900/10 to-transparent border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-12">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-3 flex-1">
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight">
              Your Collections
            </h1>
            <p className="text-base text-gray-400 leading-relaxed max-w-2xl">
              Manage and share your personal movie and TV show lists
            </p>
          </div>
          
          <button
            onClick={handleCreateClick}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/30 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            New List
          </button>
        </div>
      </div>
    </div>
  );
}
