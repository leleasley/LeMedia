import { z } from "zod";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TmdbKeySchema = z.string().min(1);

async function tmdbGet(path: string) {
    const apiKey = TmdbKeySchema.parse(process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY);
    const url = new URL(TMDB_BASE + path);
    url.searchParams.set("api_key", apiKey);
    const res = await fetch(url, { next: { revalidate: 60 * 60 } });
    if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
    return res.json();
}

export async function getMovieGenres(): Promise<{ id: number; name: string }[]> {
    const data = await tmdbGet("/genre/movie/list");
    return data.genres ?? [];
}

export async function getTvGenres(): Promise<{ id: number; name: string }[]> {
    const data = await tmdbGet("/genre/tv/list");
    return data.genres ?? [];
}
