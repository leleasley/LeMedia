"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import useSWR from "swr";
import { ServiceCommonServer, ServiceCommonServerWithDetails } from "@/lib/service-types";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(async res => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${text ? ` - ${text}` : ""}`);
    }
    return res.json();
  });

export type RequestOverrides = {
  server?: number;
  tags?: number[];
  language?: number;
};

type AdvancedRequesterProps = {
  mediaType: "movie" | "tv";
  is4k?: boolean;
  defaultOverrides?: RequestOverrides;
  onChange: (overrides: RequestOverrides) => void;
};

function AdvancedRequester({
  mediaType,
  is4k = false,
  defaultOverrides,
  onChange
}: AdvancedRequesterProps) {
  const serviceSlug = mediaType === "movie" ? "radarr" : "sonarr";
  const { data: serversData } = useSWR<{ servers: ServiceCommonServer[] }>(
    `/api/v1/service/${serviceSlug}`,
    fetcher,
    {
    revalidateOnFocus: false,
    revalidateOnReconnect: false
    }
  );

  const filteredServers = useMemo(
    () => (serversData?.servers ?? []).filter(server => server.is4k === is4k),
    [serversData, is4k]
  );

  const [selectedServer, setSelectedServer] = useState<number | null>(defaultOverrides?.server ?? null);
  const detailKey = selectedServer ? `/api/v1/service/${serviceSlug}/${selectedServer}` : null;
  const { data: serverData, isValidating } = useSWR<ServiceCommonServerWithDetails>(detailKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });

  const [selectedLanguage, setSelectedLanguage] = useState<number | null>(
    defaultOverrides?.language ?? null
  );
  const [selectedTags, setSelectedTags] = useState<number[]>(defaultOverrides?.tags ?? []);

  useEffect(() => {
    if (defaultOverrides?.server != null) {
      setSelectedServer(defaultOverrides.server);
    }
    if (defaultOverrides?.language != null) {
      setSelectedLanguage(defaultOverrides.language);
    }
    if (defaultOverrides?.tags != null) {
      setSelectedTags(defaultOverrides.tags);
    }
  }, [defaultOverrides]);

  useEffect(() => {
    if (selectedServer !== null || !filteredServers.length) return;
    const defaultServer = filteredServers.find(server => server.isDefault) ?? filteredServers[0];
    if (defaultServer) {
      setSelectedServer(defaultServer.id);
    }
  }, [filteredServers, selectedServer]);

  useEffect(() => {
    if (!serverData) return;
    if (
      !defaultOverrides?.language &&
      serverData.languageProfiles &&
      serverData.languageProfiles.length &&
      selectedLanguage === null
    ) {
      setSelectedLanguage(serverData.languageProfiles[0]?.id ?? null);
    }
    if (!defaultOverrides?.tags?.length && serverData.tags && serverData.tags.length) {
      setSelectedTags(serverData.tags.map(tag => tag.id));
    }
  }, [serverData, defaultOverrides, selectedLanguage]);

  useEffect(() => {
    if (selectedServer === null) return;
    onChange({
      server: selectedServer,
      tags: selectedTags,
      language: selectedLanguage ?? undefined
    });
  }, [onChange, selectedServer, selectedTags, selectedLanguage]);

  const hasMultipleServers = filteredServers.length > 1;
  const showLanguageDropdown = mediaType === "tv" && Boolean(serverData?.languageProfiles?.length);
  const showTags = Boolean(serverData?.tags?.length);
  const showAdvanced =
    hasMultipleServers || showLanguageDropdown || showTags;

  if (!serversData) {
    return <div className="text-xs text-gray-400">Loading advanced options...</div>;
  }

  if (!filteredServers.length || !showAdvanced) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Advanced</div>
      <div className="space-y-4 rounded-xl border border-white/10 bg-slate-900/60 p-4">
        {hasMultipleServers && (
          <div className="space-y-1 text-sm">
            <label className="font-semibold text-white/80">Destination Server</label>
            <AdaptiveSelect
              value={selectedServer ? String(selectedServer) : ""}
              onValueChange={(value) => setSelectedServer(Number(value))}
              options={filteredServers.map((server) => ({
                value: String(server.id),
                label: server.isDefault ? `${server.name} (Default)` : server.name
              }))}
              placeholder="Select server"
              className="w-full"
            />
          </div>
        )}

        {showLanguageDropdown && (
          <div className="space-y-1 text-sm">
            <label className="font-semibold text-white/80">Language Profile</label>
            <AdaptiveSelect
              value={selectedLanguage ? String(selectedLanguage) : ""}
              onValueChange={(value) => setSelectedLanguage(Number(value))}
              disabled={!serverData || isValidating}
              options={(serverData?.languageProfiles ?? []).map((language) => ({
                value: String(language.id),
                label: language.name
              }))}
              placeholder="Select language profile"
              className="w-full"
            />
          </div>
        )}

        {showTags && (
          <div className="space-y-1 text-sm">
            <label className="font-semibold text-white/80">Tags</label>
            <Select
              options={serverData?.tags?.map(tag => ({ label: tag.label, value: tag.id }))}
              isMulti
              isDisabled={!serverData || isValidating}
              className="react-select-container"
              classNamePrefix="react-select"
              placeholder="Select tags"
              value={serverData?.tags
                ?.map(tag => ({ label: tag.label, value: tag.id }))
                .filter(option => selectedTags.includes(option.value))}
              onChange={value => setSelectedTags(value.map(option => option.value))}
              menuPosition="fixed"
            />
          </div>
        )}

      </div>
    </div>
  );
}

export default AdvancedRequester;
