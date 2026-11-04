export interface RadarrMovie {
  id: number;
  title: string;
  tmdbId: number;
  imdbId: string;
  titleSlug: string;
  monitored: boolean;
  hasFile: boolean;
  isAvailable: boolean;
  status: string;
  sizeOnDisk: number;
  path: string;
  qualityProfileId: number;
  added: string;
  tags: number[];
  images: { coverType: string; remoteUrl: string }[];
  digitalRelease?: string;
  physicalRelease?: string;
  inCinemas?: string;
  releaseDate?: string;
  movieFile?: {
    id?: number;
    dateAdded: string;
    /** Full path on the Radarr host (e.g. /mnt/…/__magic__/movies/X/file.mkv). */
    path?: string;
    relativePath?: string;
    size?: number;
    languages?: { id: number; name: string }[];
    mediaInfo?: {
      audioLanguages?: string;  // e.g. "English / French"
      subtitles?: string;       // e.g. "French / English"
    };
  };
}

export interface RadarrQueueItem {
  movieId: number;
  title: string;
  status: string;
  size: number;
  sizeleft: number;
  timeleft: string;
  estimatedCompletionTime: string;
  downloadClient: string;
}

export interface RadarrHistoryRecord {
  movieId: number;
  date: string;
  eventType: string;
}
