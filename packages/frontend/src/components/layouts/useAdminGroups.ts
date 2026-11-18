import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { ADMIN_GROUPS, type AdminGroupDef, type NavServiceKey } from '@/pages/admin/tabsConfig';

type Flags = Record<NavServiceKey, boolean>;

/**
 * Admin groups with service-backed pages filtered out when that service is not configured.
 *
 * Pages without `requires` are always shown. Until the flags arrive, service pages stay hidden
 * (no flash of a page the install cannot use); if the lookup fails, everything is shown — hiding
 * an admin page because of one failed request would be worse than offering an empty one.
 */
export function useAdminGroups(): AdminGroupDef[] {
  const [flags, setFlags] = useState<Flags | null>(null);

  useEffect(() => {
    let live = true;
    api.get<Flags>('/admin/nav-services')
      .then(({ data }) => { if (live) setFlags(data); })
      .catch(() => { if (live) setFlags({ arr: true, prowlarr: true, zurg: true, rex: true, dmm: true }); });
    return () => { live = false; };
  }, []);

  return useMemo(
    () => ADMIN_GROUPS
      .map((group) => ({ ...group, tabs: group.tabs.filter((tab) => !tab.requires || !!flags?.[tab.requires]) }))
      .filter((group) => group.tabs.length > 0),
    [flags],
  );
}
