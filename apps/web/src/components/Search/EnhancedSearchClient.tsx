"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

const genreList = [
  { id: 28, name: "Action" }, { id: 12, name: "Adventure" }, { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" }, { id: 80, name: "Crime" }, { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" }, { id: 10751, name: "Family" }, { id: 14, name: "Fantasy" },
  { id: 27, name: "Horror" }, { id: 10402, name: "Music" }, { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" }, { id: 878, name: "Sci-Fi" }, { id: 53, name: "Thriller" },
  { id: 10752, name: "War" }, { id: 37, name: "Western" }
];

export function EnhancedSearchFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  
  const currentYear = new Date().getFullYear();
  const [yearMin, setYearMin] = useState(searchParams?.get("year_min") || "1980");
  const [yearMax, setYearMax] = useState(searchParams?.get("year_max") || String(currentYear + 1));
  const [ratingMin, setRatingMin] = useState(searchParams?.get("rating_min") || "0");
  const [ratingMax, setRatingMax] = useState(searchParams?.get("rating_max") || "10");
  const [genres, setGenres] = useState<number[]>(
    searchParams?.get("genres")?.split(",").map(Number).filter(Boolean) || []
  );

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    
    if (yearMin !== "1980") params.set("year_min", yearMin);
    else params.delete("year_min");
    
    if (yearMax !== String(currentYear + 1)) params.set("year_max", yearMax);
    else params.delete("year_max");
    
    if (ratingMin !== "0") params.set("rating_min", ratingMin);
    else params.delete("rating_min");
    
    if (ratingMax !== "10") params.set("rating_max", ratingMax);
    else params.delete("rating_max");
    
    if (genres.length > 0) params.set("genres", genres.join(","));
    else params.delete("genres");
    
    router.push(`/search?${params.toString()}`);
  };

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("year_min");
    params.delete("year_max");
    params.delete("rating_min");
    params.delete("rating_max");
    params.delete("genres");
    
    setYearMin("1980");
    setYearMax(String(currentYear + 1));
    setRatingMin("0");
    setRatingMax("10");
    setGenres([]);
    
    router.push(`/search?${params.toString()}`);
  };

  const hasActiveFilters = 
    yearMin !== "1980" || 
    yearMax !== String(currentYear + 1) || 
    ratingMin !== "0" || 
    ratingMax !== "10" || 
    genres.length > 0;

  return (
    <div className="mb-4">
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-800/50 border border-gray-700 hover:bg-gray-800 text-white transition"
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span>Advanced Filters</span>
        {hasActiveFilters && (
          <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-blue-500 text-white">
            Active
          </span>
        )}
      </button>

      {showFilters && (
        <div className="mt-4 p-4 rounded-xl bg-gray-800/50 border border-gray-700 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Year Range</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1900"
                  max="2030"
                  value={yearMin}
                  onChange={(e) => setYearMin(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="number"
                  min="1900"
                  max="2030"
                  value={yearMax}
                  onChange={(e) => setYearMax(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Rating (TMDB)</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={ratingMin}
                  onChange={(e) => setRatingMin(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.5"
                  value={ratingMax}
                  onChange={(e) => setRatingMax(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Genres</label>
            <div className="flex flex-wrap gap-2">
              {genreList.map(genre => (
                <button
                  key={genre.id}
                  onClick={() => setGenres(prev => 
                    prev.includes(genre.id) 
                      ? prev.filter(g => g !== genre.id) 
                      : [...prev, genre.id]
                  )}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                    genres.includes(genre.id)
                      ? "bg-blue-600 text-white"
                      : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  }`}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={applyFilters}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
            >
              Apply Filters
            </button>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
