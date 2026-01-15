export interface DownloadingItem {
  downloadId?: string;
  externalId?: string;
  size: number;
  sizeLeft: number;
  status: string;
  estimatedCompletionTime?: Date;
  title: string;
  episode?: {
    seasonNumber: number;
    episodeNumber: number;
  };
}
