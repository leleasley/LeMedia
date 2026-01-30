"use client";

import { TitleCard } from "@/components/Media/TitleCard";
import { Slider } from "@/components/Media/Slider";
import Link from "next/link";
import { ArrowRightCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchAvailabilityStatusBatched } from "@/lib/availability-client";
import { tmdbImageUrl } from "@/lib/tmdb-images";
import { availabilityToMediaStatus } from "@/lib/media-status";

interface MediaResult {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  media_type?: string;
}

interface MediaSliderProps {
  title: string;
  url: string;
  linkUrl?: string;
  sliderKey: string;
  mediaType?: "movie" | "tv";
}

export function MediaSlider({ title, url, linkUrl, sliderKey, mediaType }: MediaSliderProps) {
  const [data, setData] = useState<MediaResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<number, string>>({});
  const availabilityRef = useRef<Record<number, string>>({});

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Failed to fetch");
        }
        const json = await response.json();
        // Handle both TMDB format (results array) and direct array
        const results = json.results || json;
        setData(results.slice(0, 20));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [url]);

  useEffect(() => {
    availabilityRef.current = availability;
  }, [availability]);

  useEffect(() => {
    if (!mediaType || data.length === 0) return;
    const missing = data
      .map(item => item.id)
      .filter(id => availabilityRef.current[id] === undefined);
    if (!missing.length) return;
    fetchAvailabilityStatusBatched(mediaType, missing)
      .then(next => {
        if (Object.keys(next).length) setAvailability(prev => ({ ...prev, ...next }));
      })
      .catch(() => { });
  }, [data, mediaType]);

  if (error) {
    return null;
  }

  if (!isLoading && data.length === 0) {
    return null;
  }

  const items = data.map((item, idx) => {
    const itemMediaType = mediaType || (item.media_type as "movie" | "tv") || "movie";
    const itemTitle = item.title || item.name || "";
    const itemYear = item.release_date || item.first_air_date || "";
    const itemDescription = item.overview || "";
    const itemStatus = availability[item.id];

    // Use shared utility for consistent status mapping
    const mediaStatus = availabilityToMediaStatus(itemStatus);

    return (
      <div key={`${itemMediaType}:${item.id}`} className="w-36 sm:w-36 md:w-44">
        <TitleCard
          id={item.id}
          image={tmdbImageUrl(item.poster_path, "w500") || undefined}
          title={itemTitle}
          year={itemYear}
          description={itemDescription}
          mediaType={itemMediaType}
          userScore={item.vote_average}
          mediaStatus={mediaStatus}
          imagePriority={idx < 6}
          imageLoading={idx < 6 ? "eager" : "lazy"}
          imageFetchPriority={idx < 6 ? "high" : "auto"}
        />
      </div>
    );
  });

  return (
    <>
      <div className="slider-header">
        {linkUrl ? (
          <Link href={linkUrl} className="slider-title">
            <span>{title}</span>
            <ArrowRightCircle />
          </Link>
        ) : (
          <div className="slider-title">
            <span>{title}</span>
          </div>
        )}
      </div>
      <Slider sliderKey={sliderKey} isLoading={isLoading} isEmpty={false} items={items} />
    </>
  );
}
