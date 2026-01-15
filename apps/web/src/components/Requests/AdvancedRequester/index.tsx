"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import useSWR from "swr";
import { ServiceCommonServer, ServiceCommonServerWithDetails } from "@/lib/service-types";
import {
  Select as UiSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then(async res => {
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${text ? ` - ${text}` : ""}`);
    }
    return res.json();
  });

const formatBytes = (bytes?: number | null) => {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

type RequestUser = {
  id: number;
  username: string;
  jellyfinUsername?: string | null;
  avatarUrl?: string | null;
  jellyfinUserId?: string | null;
};

export type RequestOverrides = {
  server?: number;
  tags?: number[];
  language?: number;
  user?: RequestUser;
};

type AdvancedRequesterProps = {
  mediaType: "movie" | "tv";
  isAdmin?: boolean;
  is4k?: boolean;
  defaultOverrides?: RequestOverrides;
  onChange: (overrides: RequestOverrides) => void;
};

function AdvancedRequester({
  mediaType,
  isAdmin = false,
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
  const [selectedUser, setSelectedUser] = useState<RequestUser | null>(defaultOverrides?.user ?? null);
  const [users, setUsers] = useState<RequestUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<RequestUser | null>(null);

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
    if (defaultOverrides?.user) {
      setSelectedUser(defaultOverrides.user);
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
    if (!isAdmin || usersLoaded) return;
    let active = true;
    setUsersLoading(true);
    setUsersError(null);

    fetch("/api/v1/users", { credentials: "include" })
      .then(async res => {
        if (!res.ok) {
          throw new Error("Unable to load users");
        }
        return res.json();
      })
      .then(data => {
        if (!active) return;
        const fetched = Array.isArray(data?.users) ? data.users : [];
        setUsers(
          fetched.map((user: any) => ({
            id: Number(user.id),
            username: user.username,
            jellyfinUserId: user.jellyfinUserId ?? user.jellyfin_user_id ?? null,
            jellyfinUsername: user.jellyfinUsername ?? null,
            avatarUrl: user.avatarUrl ?? null
          }))
        );
        setUsersLoaded(true);
      })
      .catch(err => {
        if (!active) return;
        setUsersError(err?.message ?? "Unable to load users");
      })
      .finally(() => {
        if (!active) return;
        setUsersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAdmin, usersLoaded]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    fetch("/api/v1/profile", { credentials: "include" })
      .then(async res => {
        if (!res.ok) throw new Error("Unable to load profile");
        return res.json();
      })
      .then(data => {
        if (!active) return;
        const user = data?.user;
        if (!user) return;
        setCurrentProfile({
          id: Number(user.id),
          username: user.username,
          jellyfinUserId: user.jellyfinUserId ?? null,
          jellyfinUsername: user.jellyfinUsername ?? null,
          avatarUrl: user.avatarUrl ?? null
        });
      })
      .catch(() => {
        return;
      });
    return () => {
      active = false;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!users.length) return;
    if (defaultOverrides?.user) {
      const match = users.find(user => user.id === defaultOverrides.user?.id);
      if (match) {
        setSelectedUser(match);
        return;
      }
    }
    if (!selectedUser) {
      const profileMatch =
        currentProfile && users.find(user => user.id === currentProfile.id);
      if (profileMatch) {
        setSelectedUser(profileMatch);
        return;
      }
      const usernameMatch =
        currentProfile && users.find(user => user.username === currentProfile.username);
      if (usernameMatch) {
        setSelectedUser(usernameMatch);
        return;
      }
      setSelectedUser(users[0]);
    }
  }, [users, defaultOverrides, selectedUser, currentProfile]);

  useEffect(() => {
    if (selectedServer === null) return;
    onChange({
      server: selectedServer,
      tags: selectedTags,
      language: selectedLanguage ?? undefined,
      user: selectedUser ?? undefined
    });
  }, [onChange, selectedServer, selectedTags, selectedLanguage, selectedUser]);

  const hasMultipleServers = filteredServers.length > 1;
  const showLanguageDropdown = mediaType === "tv" && Boolean(serverData?.languageProfiles?.length);
  const showTags = Boolean(serverData?.tags?.length);
  const showUserSelect = isAdmin && users.length > 1;
  const showAdvanced =
    hasMultipleServers || showLanguageDropdown || showTags || showUserSelect;

  if (!serversData) {
    return <div className="text-xs text-gray-400">Loading advanced options...</div>;
  }

  if (!filteredServers.length || !showAdvanced) {
    return null;
  }

  const selectedServerDetails = filteredServers.find(server => server.id === selectedServer);

  return (
    <div className="mt-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Advanced</div>
      <div className="space-y-4 rounded-xl border border-white/10 bg-slate-900/60 p-4">
        {hasMultipleServers && (
          <div className="space-y-1 text-sm">
            <label className="font-semibold text-white/80">Destination Server</label>
            <UiSelect
              value={selectedServer ? String(selectedServer) : ""}
              onValueChange={(value) => setSelectedServer(Number(value))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select server" />
              </SelectTrigger>
              <SelectContent>
                {filteredServers.map((server) => (
                  <SelectItem key={server.id} value={String(server.id)}>
                    {server.isDefault ? `${server.name} (Default)` : server.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
          </div>
        )}

        {showLanguageDropdown && (
          <div className="space-y-1 text-sm">
            <label className="font-semibold text-white/80">Language Profile</label>
            <UiSelect
              value={selectedLanguage ? String(selectedLanguage) : ""}
              onValueChange={(value) => setSelectedLanguage(Number(value))}
              disabled={!serverData || isValidating}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select language profile" />
              </SelectTrigger>
              <SelectContent>
                {serverData?.languageProfiles?.map((language) => (
                  <SelectItem key={language.id} value={String(language.id)}>
                    {language.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
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

        {showUserSelect && selectedUser && (
          <div className="space-y-1 text-sm">
            <label className="font-semibold text-white/80">Request As</label>
            <UiSelect
              value={String(selectedUser.id)}
              onValueChange={(value) => {
                const next = users.find(user => user.id === Number(value));
                if (next) setSelectedUser(next);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                {users.map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>
                    {user.jellyfinUsername || user.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
            {usersLoading && <p className="text-xs text-gray-400">Loading users...</p>}
            {usersError && <p className="text-xs text-red-300">{usersError}</p>}
          </div>
        )}
        {usersLoading && !showUserSelect && <p className="text-xs text-gray-400">Loading users...</p>}
        {usersError && !showUserSelect && <p className="text-xs text-red-300">{usersError}</p>}
      </div>
    </div>
  );
}

export default AdvancedRequester;
