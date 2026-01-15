export default interface Media {
    id: number;
    mediaType: 'movie' | 'tv';
    tmdbId: number;
    tvdbId?: number;
    status: number;
    status4k: number;
    downloadStatus: any[];
    downloadStatus4k: any[];
    serviceUrl?: string;
    serviceUrl4k?: string;
    mediaUrl?: string;
    mediaUrl4k?: string;
    iOSPlexUrl?: string;
    iOSPlexUrl4k?: string;
    jellyfinMediaId?: string;
    jellyfinMediaId4k?: string;
    issues: any[];
    requests: any[]; // added for RequestButton
}
