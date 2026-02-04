import { NextRequest } from "next/server";
import { z } from "zod";
import { getPerson } from "@/lib/tmdb";
import { verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { tmdbImageUrl } from "@/lib/tmdb-images";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const parsed = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid person id" }, { maxAge: 0, private: true });
  }

  const person = await getPerson(parsed.data.id);
  if (!person) {
    return cacheableJsonResponseWithETag(req, { error: "Person not found" }, { maxAge: 0, private: true });
  }

  return cacheableJsonResponseWithETag(req, {
    id: person.id,
    name: person.name ?? null,
    alsoKnownAs: person.also_known_as ?? [],
    gender: person.gender ?? null,
    biography: person.biography ?? null,
    popularity: person.popularity ?? null,
    placeOfBirth: person.place_of_birth ?? null,
    profilePath: tmdbImageUrl(person.profile_path, "w500"),
    adult: !!person.adult,
    imdbId: person.imdb_id ?? null,
    homepage: person.homepage ?? null,
    birthday: person.birthday ?? null,
    deathday: person.deathday ?? null
  }, { maxAge: 300, sMaxAge: 600 });
}
