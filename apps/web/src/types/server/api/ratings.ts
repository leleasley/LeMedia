export interface IMDBRating {
  title: string;
  url: string;
  criticsScore: number;
  criticsScoreCount: number;
}

export interface RTRating {
  title: string;
  year: number;
  criticsRating: 'Certified Fresh' | 'Fresh' | 'Rotten';
  criticsScore: number;
  audienceRating?: 'Upright' | 'Spilled';
  audienceScore?: number;
  url: string;
}

export interface RatingResponse {
  rt?: RTRating;
  imdb?: IMDBRating;
}
