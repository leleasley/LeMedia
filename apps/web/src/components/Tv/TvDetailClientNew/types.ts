export type Episode = {
    episode_number: number;
    name: string;
    overview: string;
    still_path: string | null;
    air_date: string;
    vote_average: number;
    available?: boolean;
    jellyfinItemId?: string | null;
    requested?: boolean;
    requestStatus?: string | null;
    requestId?: string | null;
};

export type Season = {
    season_number: number;
    episode_count: number;
    name: string;
    poster_path: string | null;
};

export type QualityProfile = { id: number; name: string };
