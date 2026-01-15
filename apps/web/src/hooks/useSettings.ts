import { MediaServerType } from "@/types/server/constants/server";

export interface Settings {
  movie4kEnabled: boolean;
  series4kEnabled: boolean;
  youtubeUrl: string;
  discoverRegion: string;
  streamingRegion: string;
  mediaServerType: number;
  applicationTitle: string;
  cacheImages: boolean;
}

export interface SettingsContextProps {
  currentSettings: Settings;
}

const useSettings = (): SettingsContextProps => {
  return {
    currentSettings: {
      movie4kEnabled: false,
      series4kEnabled: false,
      youtubeUrl: 'https://www.youtube.com/watch?v=',
      discoverRegion: 'US',
      streamingRegion: 'US',
      mediaServerType: MediaServerType.JELLYFIN,
      applicationTitle: 'LeMedia',
      cacheImages: true,
    },
  };
};

export default useSettings;
