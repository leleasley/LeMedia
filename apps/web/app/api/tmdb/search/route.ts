import { NextRequest } from "next/server";
import { z } from "zod";
import { searchMulti, searchPerson } from "@/lib/tmdb";
import { isAvailableByTmdb } from "@/lib/jellyfin";
import { findActiveRequestByTmdb } from "@/db";
import { cacheableJsonResponseWithETag, batchRequests } from "@/lib/api-optimization";
import { enforceTmdbRateLimit } from "../_shared";

const querySchema = z.string().trim().min(1).max(100);
const pageSchema = z.coerce.number().int().positive().max(500).default(1);
const typeSchema = z.enum(["all", "movie", "tv", "person"]).default("all");

export async function GET(req: NextRequest) {
  try {
    const rateLimit = enforceTmdbRateLimit(req);
    if (rateLimit) return rateLimit;
    const q = querySchema.parse(req.nextUrl.searchParams.get("q") ?? "");
    const page = pageSchema.parse(req.nextUrl.searchParams.get("page") ?? "1");
    const type = typeSchema.parse(req.nextUrl.searchParams.get("type") ?? "all");
    
    let data: any;
    if (type === "person") {
      data = await searchPerson(q, page);
    } else {
      data = await searchMulti(q, page);
    }

    const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
    
    // Handle person-only search
    if (type === "person") {
      const personResults = results
        .filter((r: any) => r?.media_type === "person" || r?.known_for_department)
        .slice(0, 20)
        .map((r: any) => ({
          id: r.id,
          media_type: "person",
          name: r.name ?? null,
          profile_path: r.profile_path ?? null,
          known_for_department: r.known_for_department ?? null,
          known_for: r.known_for ?? [],
          popularity: typeof r.popularity === "number" ? r.popularity : null
        }));
      
      return cacheableJsonResponseWithETag(req, 
        { results: personResults },
        { maxAge: 300, sMaxAge: 600, private: true }
      );
    }
    
    // Handle all/movie/tv search
    const filteredBase = results
      .filter((r: any) => {
        const mt = r?.media_type;
        if (type === "movie") return mt === "movie";
        if (type === "tv") return mt === "tv";
        // For "all", include movies, tv, and persons
        return mt === "movie" || mt === "tv" || mt === "person";
      })
      .slice(0, 15)
      .map((r: any) => {
        // Person result
        if (r.media_type === "person") {
          return {
            id: r.id,
            media_type: "person",
            name: r.name ?? null,
            profile_path: r.profile_path ?? null,
            known_for_department: r.known_for_department ?? null,
            known_for: r.known_for ?? [],
            popularity: typeof r.popularity === "number" ? r.popularity : null
          };
        }
        
        // Movie/TV result
        return {
          id: r.id,
          media_type: r.media_type,
          title: r.title ?? null,
          name: r.name ?? null,
          poster_path: r.poster_path ?? null,
          release_date: r.release_date ?? null,
          first_air_date: r.first_air_date ?? null,
          vote_average: typeof r.vote_average === "number" ? r.vote_average : null,
          vote_count: typeof r.vote_count === "number" ? r.vote_count : null
        };
      });

    // Batch availability and request lookups for better performance (only for media, not persons)
    const decorated = await batchRequests(
      filteredBase.map((item: any) => async () => {
        // Skip availability check for persons
        if (item.media_type === "person") {
          return item;
        }
        
        let available_in_jellyfin: boolean | null = null;
        try {
          if (item.media_type === "movie") {
            available_in_jellyfin = await isAvailableByTmdb("movie", item.id);
          } else if (item.media_type === "tv") {
            available_in_jellyfin = await isAvailableByTmdb("tv", item.id);
          }
        } catch {
          available_in_jellyfin = null;
        }
        if (item.media_type === "movie") {
          const req = await findActiveRequestByTmdb({ requestType: "movie", tmdbId: item.id });
          return { ...item, request_status: req?.status ?? null, available_in_jellyfin };
        }
        // TV requests are episode-based; we skip request lookup for now
        return { ...item, request_status: null, available_in_jellyfin };
      }),
      { maxConcurrent: 5, timeout: 5000 }
    );

    // Cache search results for 5 minutes - query-specific cache
    return cacheableJsonResponseWithETag(req, 
      { results: decorated },
      { maxAge: 300, sMaxAge: 600, private: true }
    );
  } catch (err) {
    if (err instanceof z.ZodError) return cacheableJsonResponseWithETag(req, { error: "Invalid query" }, { maxAge: 0 });
    return cacheableJsonResponseWithETag(req, { error: "Search failed" }, { maxAge: 0 });
  }
}
