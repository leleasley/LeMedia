"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

export function EnhancedSearchBar() {
  const [showFilters, setShowFilters] = useState(false);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState([1980, 2026]);
  const [genres, setGenres] = useState<number[]>([]);
  const [rating, setRating] = useState([0, 10]);

  const genreList = [
    { id: 28, name: "Action" }, { id: 12, name: "Adventure" }, { id: 16, name: "Animation" },
    { id: 35, name: "Comedy" }, { id: 80, name: "Crime" }, { id: 99, name: "Documentary" },
    { id: 18, name: "Drama" }, { id: 10751, name: "Family" }, { id: 14, name: "Fantasy" },
    { id: 27, name: "Horror" }, { id: 10402, name: "Music" }, { id: 9648, name: "Mystery" },
    { id: 10749, name: "Romance" }, { id: 878, name: "Sci-Fi" }, { id: 10770, name: "TV Movie" },
    { id: 53, name: "Thriller" }, { id: 10752, name: "War" }, { id: 37, name: "Western" }
  ];

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (year[0] !== 1980 || year[1] !== 2026) {
      params.set("year_min", year[0].toString());
      params.set("year_max", year[1].toString());
    }
    if (genres.length > 0) params.set("genres", genres.join(","));
    if (rating[0] !== 0 || rating[1] !== 10) {
      params.set("rating_min", rating[0].toString());
      params.set("rating_max", rating[1].toString());
    }
    window.location.href = `/search?${params.toString()}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search movies & TV shows..."
          className="w-full px-4 py-3 pl-12 pr-24 rounded-xl bg-gray-800/50 border border-gray-700 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-gray-700/50 hover:bg-gray-700 text-gray-300 text-sm flex items-center gap-2"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

      {showFilters && (
        <div className="mt-4 p-4 rounded-xl bg-gray-800/50 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Year Range</label>
              <div className="flex gap-2">
                <input type="number" min="1900" max="2030" value={year[0]} onChange={(e) => setYear([+e.target.value, year[1]])} className="w-24 px-2 py-1 rounded bg-gray-700 text-white text-sm" />
                <span className="text-gray-400">to</span>
                <input type="number" min="1900" max="2030" value={year[1]} onChange={(e) => setYear([year[0], +e.target.value])} className="w-24 px-2 py-1 rounded bg-gray-700 text-white text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Rating (TMDB)</label>
              <div className="flex gap-2">
                <input type="number" min="0" max="10" step="0.5" value={rating[0]} onChange={(e) => setRating([+e.target.value, rating[1]])} className="w-24 px-2 py-1 rounded bg-gray-700 text-white text-sm" />
                <span className="text-gray-400">to</span>
                <input type="number" min="0" max="10" step="0.5" value={rating[1]} onChange={(e) => setRating([rating[0], +e.target.value])} className="w-24 px-2 py-1 rounded bg-gray-700 text-white text-sm" />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Genres</label>
            <div className="flex flex-wrap gap-2">
              {genreList.map(genre => (
                <button
                  key={genre.id}
                  onClick={() => setGenres(prev => prev.includes(genre.id) ? prev.filter(g => g !== genre.id) : [...prev, genre.id])}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${genres.includes(genre.id) ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-300 hover:bg-gray-600"}`}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
