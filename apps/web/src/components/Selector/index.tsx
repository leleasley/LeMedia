"use client";

// Placeholder for WatchProviderSelector
// This would need to be implemented based on your requirements
export function WatchProviderSelector({
  type,
  region,
  activeProviders,
  onChange,
}: {
  type: "movie" | "tv";
  region?: string;
  activeProviders?: number[];
  onChange: (region: string, providers: number[]) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-gray-400">
      <p className="text-sm">Watch Provider Selector (To be implemented)</p>
      <p className="text-xs mt-1">Type: {type}</p>
    </div>
  );
}
