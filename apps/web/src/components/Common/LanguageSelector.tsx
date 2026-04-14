"use client";

import useSWR from "swr";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

interface Language {
  iso_639_1: string;
  english_name: string;
  name: string;
}

interface LanguageSelectorProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}

export function LanguageSelector({ value, onChange, label = "Language" }: LanguageSelectorProps) {
  const { data } = useSWR<{ languages: Language[] }>("/api/v1/tmdb/languages");
  const languages = (data?.languages ?? []).sort((a, b) => a.english_name.localeCompare(b.english_name));

  return (
    <div className="w-full">
      {label && <label className="mb-2 block text-sm font-semibold text-white">{label}</label>}
      <AdaptiveSelect
        value={value ?? ""}
        onValueChange={(nextValue) => onChange(nextValue || null)}
        options={[
          { value: "", label: "None (Default)" },
          ...languages.map((language) => ({
            value: language.iso_639_1,
            label: `${language.english_name} (${language.iso_639_1})`
          }))
        ]}
        placeholder="Select a language..."
      />
    </div>
  );
}
