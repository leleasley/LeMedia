export type QualityProfile = { id: number; name: string };
export type RootFolder = { id: number; path: string; freeSpace?: number | null; totalSpace?: number | null };
export type Tag = { id: number; label: string };
export type LanguageProfile = { id: number; name: string };

export interface ServiceCommonServer {
  id: number;
  name: string;
  is4k: boolean;
  isDefault: boolean;
  activeProfileId: number | null;
  activeDirectory: string | null;
  activeLanguageProfileId?: number | null;
  activeAnimeProfileId?: number | null;
  activeAnimeDirectory?: string | null;
  activeAnimeLanguageProfileId?: number | null;
  activeTags: number[];
  activeAnimeTags?: number[];
}

export interface ServiceCommonServerWithDetails {
  server: ServiceCommonServer;
  profiles: QualityProfile[];
  rootFolders: Partial<RootFolder>[];
  languageProfiles?: LanguageProfile[];
  tags: Tag[];
}
