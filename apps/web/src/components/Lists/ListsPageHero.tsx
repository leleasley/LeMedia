"use client";

import { Plus, ListChecks } from "lucide-react";

export function ListsPageHero() {
  const handleCreateClick = () => {
    window.dispatchEvent(new CustomEvent('openCreateListModal'));
  };

  return (
    <section className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl md:rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-6 md:p-8">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-white/10">
                <ListChecks className="w-7 h-7 text-indigo-300" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white">Your Lists</h1>
                <p className="text-sm text-white/60 mt-1">Curate, organize, and share your favorite movies and TV shows</p>
              </div>
            </div>
            <button
              onClick={handleCreateClick}
              className="hidden sm:inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm transition-all hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              New List
            </button>
          </div>
          {/* Mobile button */}
          <button
            onClick={handleCreateClick}
            className="sm:hidden mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            New List
          </button>
        </div>
      </div>
    </section>
  );
}
