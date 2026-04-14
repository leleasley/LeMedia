"use client";

import useSWR from "swr";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

interface Region {
  iso_3166_1: string;
  english_name: string;
  native_name: string;
}

interface RegionSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}

export function RegionSelector({ value, onChange, label = "Region" }: RegionSelectorProps) {
  const { data } = useSWR<{ regions: Region[] }>("/api/v1/tmdb/regions");
  const regions = data?.regions ?? [];

  return (
    <div className="w-full">
      {label && <label className="mb-2 block text-sm font-semibold text-white">{label}</label>}
      <AdaptiveSelect
        value={value ?? ""}
        onValueChange={(nextValue) => onChange(nextValue || null)}
        options={[
          { value: "", label: "None (Global)" },
          ...regions.map((region) => ({
            value: region.iso_3166_1,
            label: `${region.english_name} (${region.iso_3166_1})`
          }))
        ]}
        placeholder="Select a region..."
      />
    </div>
  );
}
