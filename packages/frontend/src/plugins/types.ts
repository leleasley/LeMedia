// Plugin wire types moved to @lemedia/shared. Re-exported here so existing
// `import { PluginInfo } from '@/plugins/types'` paths keep working.
export type {
  PluginUIContribution, PluginInfo, PluginSettingDef, PluginSettings,
} from '@lemedia/shared';
import type { PluginUIContribution } from '@lemedia/shared';

/** Props received by a plugin hook component — frontend-only, stays here. */
export interface HookComponentProps {
  contribution: PluginUIContribution;
  context: Record<string, unknown>;
}
