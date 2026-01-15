import { MediaService } from "@/lib/service-config";
import { ServiceCommonServer } from "./service-types";

const toNumber = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toBoolean = (value: unknown) => Boolean(value);

const toStringValue = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
};

const toNumberArray = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value
      .map(toNumber)
      .filter((value): value is number => Number.isFinite(value));
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map(str => str.trim())
      .map(toNumber)
      .filter((value): value is number => Number.isFinite(value));
  }
  return [];
};

export function buildRadarrServerSummary(service: MediaService): ServiceCommonServer {
  const config = (typeof service.config === "object" && service.config) || {};
  return {
    id: service.id,
    name: service.name,
    is4k: toBoolean(config.fourKServer),
    isDefault: toBoolean(config.defaultServer),
    activeProfileId: toNumber(config.qualityProfileId ?? config.qualityProfile),
    activeDirectory: toStringValue(config.rootFolder),
    activeLanguageProfileId: toNumber(config.languageProfileId),
    activeTags: toNumberArray(config.tags),
    activeAnimeTags: toNumberArray(config.animeTags)
  };
}

export function buildSonarrServerSummary(service: MediaService): ServiceCommonServer {
  const config = (typeof service.config === "object" && service.config) || {};
  return {
    id: service.id,
    name: service.name,
    is4k: toBoolean(config.fourKServer),
    isDefault: toBoolean(config.defaultServer),
    activeProfileId: toNumber(config.qualityProfileId ?? config.qualityProfile),
    activeDirectory: toStringValue(config.rootFolder),
    activeLanguageProfileId: toNumber(config.languageProfileId),
    activeAnimeProfileId: toNumber(config.animeQualityProfileId),
    activeAnimeDirectory: toStringValue(config.animeRootFolder),
    activeAnimeLanguageProfileId: toNumber(config.animeLanguageProfileId),
    activeTags: toNumberArray(config.tags),
    activeAnimeTags: toNumberArray(config.animeTags)
  };
}
