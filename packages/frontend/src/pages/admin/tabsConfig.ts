import {
  Mail,
  Users,
  Shield,
  Server,
  Bell,
  Film,
  RefreshCw,
  ScrollText,
  LayoutDashboard,
  Home,
  Key,
  KeyRound,
  Star,
  Folder,
  Workflow,
  Tag,
  Ban,
  MessageSquareWarning,
  Cog,
  SlidersHorizontal,
  Archive,
  ToggleRight,
  AlertTriangle,
  DownloadCloud,
  Link as LinkIcon,
  type LucideIcon,
  HardDrive,
  MonitorPlay,
  Boxes,
  Radar,
  ListPlus,
} from 'lucide-react';

/** Service page a tab needs. Tabs without one are always shown; the rest appear only when the
 *  matching service is configured (see GET /api/admin/nav-services). */
export type NavServiceKey = 'arr' | 'prowlarr' | 'zurg' | 'rex' | 'dmm';

/** Individual page inside a group — rendered as a sub-tab when the group has >1 entry. */
export interface AdminTabDef {
  id: AdminTabId;
  label: string;
  icon: LucideIcon;
  requires?: NavServiceKey;
}

/** Top-level bucket in the admin sidebar. Multi-tab groups derive their sidebar subtitle from
 *  `tabs[]` (comma-separated list of labels). Single-tab groups can provide an explicit
 *  `description` to keep the sidebar layout visually consistent — otherwise there's no subtitle. */
export interface AdminGroupDef {
  id: string;
  label: string;
  icon: LucideIcon;
  tabs: AdminTabDef[];
  /** i18n key — only used when `tabs.length === 1`, ignored otherwise. */
  description?: string;
}

export type AdminTabId =
  | 'dashboard'
  | 'zurg'
  | 'arr'
  | 'prowlarr'
  | 'lists'
  | 'rex'
  | 'instance'
  | 'features'
  | 'homepage'
  | 'users'
  | 'roles'
  | 'auth'
  | 'api-keys'
  | 'services'
  | 'quality'
  | 'criteria'
  | 'paths'
  | 'rules'
  | 'keywords'
  | 'blacklist'
  | 'notifications'
  | 'jobs'
  | 'logs'
  | 'backups'
  | 'danger'
  | 'plugins'
  | 'links'
  | 'import'
  | (string & {});

export const ADMIN_GROUPS: AdminGroupDef[] = [
  {
    id: 'dashboard',
    label: 'admin.group.dashboard',
    icon: LayoutDashboard,
    description: 'admin.group.dashboard_desc',
    tabs: [
      { id: 'dashboard', label: 'admin.tab.dashboard', icon: LayoutDashboard },
    ],
  },
  {
    id: 'access',
    label: 'admin.group.access',
    icon: Users,
    tabs: [
      { id: 'users', label: 'admin.tab.users', icon: Users },
      { id: 'roles', label: 'admin.tab.roles', icon: Shield },
      { id: 'auth', label: 'admin.tab.auth', icon: KeyRound },
      { id: 'api-keys', label: 'admin.tab.api_keys', icon: Key },
    ],
  },
  {
    id: 'media',
    label: 'admin.group.media',
    icon: Film,
    tabs: [
      { id: 'quality', label: 'admin.tab.quality', icon: Star },
      { id: 'criteria', label: 'admin.tab.criteria', icon: SlidersHorizontal },
      { id: 'paths', label: 'admin.tab.paths', icon: Folder },
      { id: 'rules', label: 'admin.tab.rules', icon: Workflow },
      { id: 'keywords', label: 'admin.tab.keywords', icon: Tag },
      { id: 'blacklist', label: 'admin.tab.blacklist', icon: Ban },
      { id: 'issues', label: 'admin.tab.issues', icon: MessageSquareWarning },
      { id: 'lists', label: 'admin.tab.lists', icon: ListPlus },
      { id: 'arr', label: 'admin.tab.arr', icon: Boxes, requires: 'arr' },
      { id: 'prowlarr', label: 'admin.tab.prowlarr', icon: Radar, requires: 'prowlarr' },
      { id: 'zurg', label: 'admin.tab.zurg', icon: HardDrive, requires: 'zurg' },
      { id: 'rex', label: 'admin.tab.rex', icon: MonitorPlay, requires: 'rex' },
      { id: 'dmm', label: 'admin.tab.dmm', icon: DownloadCloud, requires: 'dmm' },
    ],
  },
  {
    id: 'configuration',
    label: 'admin.group.configuration',
    icon: SlidersHorizontal,
    tabs: [
      { id: 'features', label: 'admin.tab.features', icon: ToggleRight },
      { id: 'services', label: 'admin.tab.services', icon: Server },
      { id: 'notifications', label: 'admin.tab.notifications', icon: Bell },
      { id: 'homepage', label: 'admin.tab.homepage', icon: Home },
      { id: 'links', label: 'admin.tab.links', icon: LinkIcon },
    ],
  },
  {
    id: 'system',
    label: 'admin.group.system',
    icon: Cog,
    tabs: [
      { id: 'instance', label: 'admin.tab.instance', icon: Server },
      { id: 'mail', label: 'admin.tab.mail', icon: Mail },
      { id: 'backups', label: 'admin.tab.backups', icon: Archive },
      { id: 'import', label: 'admin.tab.import', icon: DownloadCloud },
      { id: 'jobs', label: 'admin.tab.jobs', icon: RefreshCw },
      { id: 'logs', label: 'admin.tab.logs', icon: ScrollText },
      { id: 'danger', label: 'admin.tab.danger', icon: AlertTriangle },
    ],
  },
];

/** Flat list — kept for callers that need every tab id (e.g. URL validation, plugin dispatch). */
export const ADMIN_TABS: AdminTabDef[] = ADMIN_GROUPS.flatMap((g) => g.tabs);

/** Look up which group owns a given tab id (e.g. for rendering the active group in the sidebar). */
export function findGroupForTab(tabId: string): AdminGroupDef | undefined {
  return ADMIN_GROUPS.find((g) => g.tabs.some((t) => t.id === tabId));
}
