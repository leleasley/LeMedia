"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { DashboardSliderType } from "@/lib/dashboard-sliders";
import AsyncSelect from "react-select/async";
import { WatchProviderSelector } from "@/components/Selector";

type Option = { label: string; value: number };

type CreateSliderProps = {
  onCreate: () => void;
  slider?: {
    id?: number;
    type?: number;
    title?: string | null;
    data?: string | null;
  };
};

const sliderTypeOptions = [
  { value: DashboardSliderType.TMDB_SEARCH, label: "TMDB Search", placeholder: "Search query" },
  { value: DashboardSliderType.TMDB_MOVIE_KEYWORD, label: "TMDB Movie Keywords", placeholder: "Search keywords..." },
  { value: DashboardSliderType.TMDB_TV_KEYWORD, label: "TMDB TV Keywords", placeholder: "Search keywords..." },
  { value: DashboardSliderType.TMDB_MOVIE_GENRE, label: "TMDB Movie Genre", placeholder: "Search genres..." },
  { value: DashboardSliderType.TMDB_TV_GENRE, label: "TMDB TV Genre", placeholder: "Search genres..." },
  { value: DashboardSliderType.TMDB_STUDIO, label: "TMDB Studio", placeholder: "Search studios..." },
  { value: DashboardSliderType.TMDB_NETWORK, label: "TMDB Network", placeholder: "Search networks..." },
];

export default function CreateSlider({ onCreate, slider }: CreateSliderProps) {
  const toast = useToast();
  const [sliderType, setSliderType] = useState<number>(
    slider?.type ?? DashboardSliderType.TMDB_MOVIE_KEYWORD
  );
  const [title, setTitle] = useState(slider?.title ?? "");
  const [data, setData] = useState(slider?.data ?? "");
  const [defaultDataValue, setDefaultDataValue] = useState<Option[] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeOption = sliderTypeOptions.find((opt) => opt.value === sliderType);

  // Load default values for editing
  useEffect(() => {
    if (!slider?.data) return;

    const loadDefaults = async () => {
      if (
        sliderType === DashboardSliderType.TMDB_MOVIE_KEYWORD ||
        sliderType === DashboardSliderType.TMDB_TV_KEYWORD
      ) {
        const keywords = await Promise.all(
          slider.data!.split(",").map(async (keywordId) => {
            try {
              const res = await fetch(`/api/v1/tmdb/keyword/${keywordId}`);
              if (!res.ok) return null;
              const keyword = await res.json();
              return keyword ? { label: keyword.name, value: keyword.id } : null;
            } catch {
              return null;
            }
          })
        );
        const valid = keywords.filter((k): k is Option => k !== null);
        if (valid.length) setDefaultDataValue(valid);
      } else if (
        sliderType === DashboardSliderType.TMDB_MOVIE_GENRE ||
        sliderType === DashboardSliderType.TMDB_TV_GENRE
      ) {
        try {
          const mediaType = sliderType === DashboardSliderType.TMDB_TV_GENRE ? "tv" : "movie";
          const res = await fetch(`/api/v1/tmdb/genre/${mediaType}`);
          if (res.ok) {
            const json = await res.json();
            const genre = json.genres?.find((g: any) => g.id === Number(slider.data));
            if (genre) setDefaultDataValue([{ label: genre.name, value: genre.id }]);
          }
        } catch {
          // ignore
        }
      } else if (
        sliderType === DashboardSliderType.TMDB_STUDIO ||
        sliderType === DashboardSliderType.TMDB_NETWORK
      ) {
        try {
          const res = await fetch(`/api/v1/tmdb/company/${slider.data}`);
          if (res.ok) {
            const company = await res.json();
            if (company) setDefaultDataValue([{ label: company.name, value: company.id }]);
          }
        } catch {
          // ignore
        }
      }
    };

    loadDefaults();
  }, [slider, sliderType]);

  const loadKeywordOptions = async (inputValue: string) => {
    const q = inputValue.trim();
    if (!q) return [];
    try {
      const res = await fetch(`/api/v1/tmdb/keyword-search?query=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const json = await res.json();
      const results = Array.isArray(json?.results) ? json.results : [];
      return results.map((r: any) => ({ label: String(r.name), value: Number(r.id) }));
    } catch {
      return [];
    }
  };

  const loadGenreOptions = async (type: "movie" | "tv") => {
    try {
      const res = await fetch(`/api/v1/tmdb/genre/${type}`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.genres ?? []).map((g: any) => ({ label: g.name, value: g.id }));
    } catch {
      return [];
    }
  };

  const loadCompanyOptions = async (inputValue: string) => {
    const q = inputValue.trim();
    if (!q) return [];
    try {
      const res = await fetch(`/api/v1/tmdb/company-search?query=${encodeURIComponent(q)}`);
      if (!res.ok) return [];
      const json = await res.json();
      const results = Array.isArray(json?.results) ? json.results : [];
      return results.map((r: any) => ({ label: String(r.name), value: Number(r.id) }));
    } catch {
      return [];
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !data.trim()) {
      toast.error("Please provide both title and data");
      return;
    }

    setIsSubmitting(true);
    try {
      if (slider?.id) {
        const res = await fetch(`/api/v1/settings/dashboard/${slider.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: sliderType, title, data }),
        });
        if (!res.ok) throw new Error("Update failed");
        toast.success("Slider updated successfully");
      } else {
        const res = await fetch("/api/v1/settings/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: sliderType, title, data }),
        });
        if (!res.ok) throw new Error("Create failed");
        toast.success("Slider created successfully");
      }
      onCreate();
      if (!slider?.id) {
        setTitle("");
        setData("");
        setDefaultDataValue(null);
      }
    } catch {
      toast.error(slider?.id ? "Failed to update slider" : "Failed to create slider");
    } finally {
      setIsSubmitting(false);
    }
  };

  let dataInput: React.ReactNode;

  switch (sliderType) {
    case DashboardSliderType.TMDB_MOVIE_KEYWORD:
    case DashboardSliderType.TMDB_TV_KEYWORD:
      dataInput = (
        <AsyncSelect
          key={`keyword-${defaultDataValue}`}
          isMulti
          cacheOptions
          defaultOptions={false}
          defaultValue={defaultDataValue}
          loadOptions={loadKeywordOptions}
          placeholder={activeOption?.placeholder}
          onChange={(opts) => {
            const list = Array.isArray(opts) ? opts.map((o) => o.value).join(",") : "";
            setData(list);
          }}
          className="react-select-container"
          classNamePrefix="react-select"
          noOptionsMessage={({ inputValue }) =>
            inputValue === "" ? "Start typing to search." : "No results."
          }
        />
      );
      break;
    case DashboardSliderType.TMDB_MOVIE_GENRE:
      dataInput = (
        <AsyncSelect
          key={`movie-genre-${defaultDataValue}`}
          cacheOptions
          defaultOptions
          defaultValue={defaultDataValue?.[0]}
          loadOptions={() => loadGenreOptions("movie")}
          placeholder={activeOption?.placeholder}
          onChange={(opt) => setData(String((opt as Option | null)?.value ?? ""))}
          className="react-select-container"
          classNamePrefix="react-select"
        />
      );
      break;
    case DashboardSliderType.TMDB_TV_GENRE:
      dataInput = (
        <AsyncSelect
          key={`tv-genre-${defaultDataValue}`}
          cacheOptions
          defaultOptions
          defaultValue={defaultDataValue?.[0]}
          loadOptions={() => loadGenreOptions("tv")}
          placeholder={activeOption?.placeholder}
          onChange={(opt) => setData(String((opt as Option | null)?.value ?? ""))}
          className="react-select-container"
          classNamePrefix="react-select"
        />
      );
      break;
    case DashboardSliderType.TMDB_STUDIO:
    case DashboardSliderType.TMDB_NETWORK:
      dataInput = (
        <AsyncSelect
          key={`company-${defaultDataValue}`}
          cacheOptions
          defaultOptions={false}
          defaultValue={defaultDataValue?.[0]}
          loadOptions={loadCompanyOptions}
          placeholder={activeOption?.placeholder}
          onChange={(opt) => setData(String((opt as Option | null)?.value ?? ""))}
          className="react-select-container"
          classNamePrefix="react-select"
          noOptionsMessage={({ inputValue }) =>
            inputValue === "" ? "Start typing to search." : "No results."
          }
        />
      );
      break;
    default:
      dataInput = (
        <input
          type="text"
          id="data"
          value={data}
          onChange={(e) => setData(e.target.value)}
          placeholder={activeOption?.placeholder}
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
        />
      );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col space-y-2 text-gray-100">
      <select
        id="sliderType"
        value={sliderType}
        onChange={(e) => {
          setSliderType(Number(e.target.value));
          setData("");
          setDefaultDataValue(null);
        }}
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
      >
        {sliderTypeOptions.map((option) => (
          <option value={option.value} key={`type-${option.value}`}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        id="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Slider Name"
        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-indigo-500 focus:outline-none"
      />
      {dataInput}
      <div className="flex-1" />
      <div>
        <button
          type="submit"
          disabled={isSubmitting || !title.trim() || !data.trim()}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {slider?.id ? "Edit Slider" : "Add Slider"}
        </button>
      </div>
    </form>
  );
}
