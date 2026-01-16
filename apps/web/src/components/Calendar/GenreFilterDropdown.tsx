"use client";

import { useEffect, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { X, ChevronDown } from "lucide-react";
import { clsx } from "clsx";

interface Genre {
  id: number;
  name: string;
}

interface GenreFilterDropdownProps {
  selectedGenres: number[];
  onGenresChange: (genreIds: number[]) => void;
  mediaType?: "movie" | "tv" | "all";
}

export function GenreFilterDropdown({
  selectedGenres,
  onGenresChange,
  mediaType = "all"
}: GenreFilterDropdownProps) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    async function loadGenres() {
      try {
        // Fetch genres for both movie and TV
        const requests: Promise<Response>[] = [];

        if (mediaType === "all" || mediaType === "movie") {
          requests.push(fetch("/api/v1/tmdb/genres?type=movie"));
        }
        if (mediaType === "all" || mediaType === "tv") {
          requests.push(fetch("/api/v1/tmdb/genres?type=tv"));
        }

        const responses = await Promise.all(requests);
        const data = await Promise.all(responses.map(r => r.json()));

        if (cancelled) return;

        // Combine and deduplicate genres
        const allGenres: Genre[] = [];
        const seenIds = new Set<number>();

        data.forEach(d => {
          (d.genres || []).forEach((g: Genre) => {
            if (!seenIds.has(g.id)) {
              seenIds.add(g.id);
              allGenres.push(g);
            }
          });
        });

        // Sort alphabetically
        allGenres.sort((a, b) => a.name.localeCompare(b.name));
        setGenres(allGenres);
      } catch (error) {
        console.error("Failed to load genres:", error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadGenres();
    return () => {
      cancelled = true;
    };
  }, [mediaType]);

  const toggleGenre = (genreId: number) => {
    if (selectedGenres.includes(genreId)) {
      onGenresChange(selectedGenres.filter(id => id !== genreId));
    } else {
      onGenresChange([...selectedGenres, genreId]);
    }
  };

  const clearGenres = () => {
    onGenresChange([]);
  };

  const selectedGenreNames = genres
    .filter(g => selectedGenres.includes(g.id))
    .map(g => g.name);

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={clsx(
            "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            selectedGenres.length > 0
              ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20"
              : "border-gray-700 bg-gray-800/50 text-gray-300 hover:bg-gray-700/50"
          )}
        >
          <span>Genres</span>
          {selectedGenres.length > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
              {selectedGenres.length}
            </span>
          )}
          <ChevronDown className="h-4 w-4" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 w-72 rounded-lg border border-gray-700 bg-gray-800 shadow-xl"
          sideOffset={5}
          align="start"
        >
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Filter by Genre</h3>
            {selectedGenres.length > 0 && (
              <button
                type="button"
                onClick={clearGenres}
                className="text-xs text-gray-400 hover:text-white transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-indigo-500" />
              </div>
            ) : genres.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                No genres available
              </div>
            ) : (
              <div className="space-y-1">
                {genres.map((genre) => {
                  const isSelected = selectedGenres.includes(genre.id);
                  return (
                    <button
                      key={genre.id}
                      type="button"
                      onClick={() => toggleGenre(genre.id)}
                      className={clsx(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        isSelected
                          ? "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
                          : "text-gray-300 hover:bg-gray-700/50"
                      )}
                    >
                      <div
                        className={clsx(
                          "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                          isSelected
                            ? "border-indigo-500 bg-indigo-500"
                            : "border-gray-600 bg-gray-900"
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="h-3 w-3 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <span>{genre.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedGenres.length > 0 && (
            <div className="border-t border-gray-700 p-3">
              <div className="mb-2 text-xs font-medium text-gray-400">Selected:</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedGenreNames.map((name, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-1 text-xs text-indigo-300"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
