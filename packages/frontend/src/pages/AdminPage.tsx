import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { usePluginUI } from '@/plugins/usePlugins';
import { PluginAdminTab } from '@/plugins/PluginAdminTab';
import { ADMIN_TABS, findGroupForTab } from './admin/tabsConfig';

import { DashboardTab } from './admin/DashboardTab';
import { BackupsTab } from './admin/BackupsTab';
import { InstanceTab } from './admin/InstanceTab';
import { FeaturesTab } from './admin/FeaturesTab';
import { DangerTab } from './admin/DangerTab';
import { UsersTab } from './admin/UsersTab';
import { ServicesTab } from './admin/ServicesTab';
import { QualityTab } from './admin/QualityTab';
import { CriteriaTab } from './admin/CriteriaTab';
import { PathsTab } from './admin/PathsTab';
import { RoutingRulesTab } from './admin/RoutingRulesTab';
import { KeywordsTab } from './admin/KeywordsTab';
import { BlacklistTab } from './admin/BlacklistTab';
import { NotificationsTab } from './admin/NotificationsTab';
import { JobsTab } from './admin/JobsTab';
import { LogsTab } from './admin/LogsTab';
import { RolesTab } from './admin/RolesTab';
import { HomepageTab } from './admin/HomepageTab';
import { LinksTab } from './admin/LinksTab';
import { AuthProvidersTab } from './admin/AuthProvidersTab';
import { MailTab } from './admin/MailTab';
import { ApiKeysTab } from './admin/ApiKeysTab';
import { ImportTab } from './admin/ImportTab';
import { ZurgPage } from './admin/ZurgPage';
import { ArrTab } from './admin/ArrTab';
import { ProwlarrTab } from './admin/ProwlarrTab';
import { RexTab } from './admin/RexTab';
import { ListsTab } from './admin/ListsTab';

export default function AdminPage() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { contributions: pluginTabs } = usePluginUI('admin.tabs');

  const pluginTabIds = useMemo(
    () => pluginTabs.map((c) => `plugin:${c.pluginId}`),
    [pluginTabs]
  );

  const tabFromUrl = searchParams.get('tab');
  // Zurg Cleanup moved inside the Zurg page; keep old links and bookmarks working.
  useEffect(() => {
    if (tabFromUrl !== 'cleanup') return;
    const n = new URLSearchParams(searchParams);
    n.set('tab', 'zurg'); n.set('section', 'cleanup');
    navigate(`/admin?${n.toString()}`, { replace: true });
  }, [tabFromUrl, searchParams, navigate]);
  const allTabIds = [...ADMIN_TABS.map((tb) => tb.id), ...pluginTabIds];
  const defaultTab = ADMIN_TABS[0]?.id ?? 'users';
  const activeTab = tabFromUrl && allTabIds.includes(tabFromUrl) ? tabFromUrl : defaultTab;
  const activeGroup = findGroupForTab(activeTab);

  const canAccess = !!user && hasPermission('admin.*');
  useEffect(() => {
    if (user && !hasPermission('admin.*')) navigate('/');
  }, [user, hasPermission, navigate]);
  if (!canAccess) return null;

  const activePluginTab = activeTab.startsWith('plugin:') ? activeTab.replace('plugin:', '') : null;
  const showGroupHeader = !!activeGroup && !activePluginTab;

  const pageTitle = activePluginTab
    ? (() => { const c = pluginTabs.find((p) => p.pluginId === activePluginTab); return typeof c?.props.label === 'string' ? c.props.label : activePluginTab; })()
    : t(ADMIN_TABS.find((tb) => tb.id === activeTab)?.label ?? 'admin.title');

  return (
    <div className="max-w-[1800px] mx-auto px-4 sm:px-6 pt-5 pb-10" key={activeTab}>
      {/* Desktop page header, the sidebar lists every page, so no sub-tab strip is needed.
          Phones show the page name in their own top bar instead. */}
      <header className="hidden md:block mb-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ndp-text-dim">
          {activePluginTab ? t('admin.sidebar.plugin_pages', 'Plugin pages') : activeGroup && activeGroup.tabs.length > 1 ? t(activeGroup.label) : t('admin.short_title', 'Admin')}
        </p>
        <h1 className="font-display-title text-[2.6rem] text-ndp-text mt-1.5">{pageTitle}</h1>
        {showGroupHeader && activeGroup && activeGroup.tabs.length === 1 && activeGroup.description && (
          <p className="text-sm text-ndp-text-muted mt-2">{t(activeGroup.description)}</p>
        )}
      </header>

      {activeTab === 'dashboard' && <DashboardTab />}
      {activeTab === 'instance' && <InstanceTab />}
      {activeTab === 'features' && <FeaturesTab />}
      {activeTab === 'homepage' && <HomepageTab />}
      {activeTab === 'links' && <LinksTab />}
      {activeTab === 'users' && <UsersTab />}
      {activeTab === 'roles' && <RolesTab />}
      {activeTab === 'auth' && <AuthProvidersTab />}
      {activeTab === 'mail' && <MailTab />}
      {activeTab === 'api-keys' && <ApiKeysTab />}
      {activeTab === 'services' && <ServicesTab />}
      {activeTab === 'quality' && <QualityTab />}
      {activeTab === 'criteria' && <CriteriaTab />}
      {activeTab === 'paths' && <PathsTab />}
      {activeTab === 'rules' && <RoutingRulesTab />}
      {activeTab === 'keywords' && <KeywordsTab />}
      {activeTab === 'blacklist' && <BlacklistTab />}
      {activeTab === 'arr' && <ArrTab />}
      {activeTab === 'prowlarr' && <ProwlarrTab />}
      {activeTab === 'zurg' && <ZurgPage />}
      {activeTab === 'lists' && <ListsTab />}
      {activeTab === 'rex' && <RexTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'jobs' && <JobsTab />}
      {activeTab === 'logs' && <LogsTab />}
      {activeTab === 'backups' && <BackupsTab />}
      {activeTab === 'import' && <ImportTab />}
      {activeTab === 'danger' && <DangerTab />}
      {activePluginTab && <PluginAdminTab pluginId={activePluginTab} />}
    </div>
  );
}
