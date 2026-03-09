import { AnimatedCheckbox } from "@/components/Common/AnimatedCheckbox";

type MaintenanceSectionProps = {
  maintenanceEnabled: boolean;
  maintenanceMessage: string;
  maintenanceLoading: boolean;
  savingMaintenance: boolean;
  onMaintenanceEnabledChange: (nextValue: boolean) => void;
  onMaintenanceMessageChange: (nextValue: string) => void;
  onSave: () => void;
};

export function MaintenanceSection({
  maintenanceEnabled,
  maintenanceMessage,
  maintenanceLoading,
  savingMaintenance,
  onMaintenanceEnabledChange,
  onMaintenanceMessageChange,
  onSave,
}: MaintenanceSectionProps) {
  return (
    <section className="rounded-md border border-white/10 bg-slate-900/60 p-4 space-y-3">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Operations</p>
        <h3 className="text-sm font-semibold text-white">Maintenance Mode</h3>
        <p className="text-xs text-muted mt-1">
          Temporarily block new requests while Radarr/Sonarr are offline or being upgraded.
        </p>
        <p className="text-xs text-muted mt-1">
          When enabled, LeMedia sends one maintenance notification to configured non-email endpoints
          and pauses system health/error alerts until maintenance is disabled.
        </p>
      </div>

      <AnimatedCheckbox
        id="maintenance-enabled"
        checked={maintenanceEnabled}
        onChange={(e) => onMaintenanceEnabledChange(e.target.checked)}
        disabled={maintenanceLoading || savingMaintenance}
        label={maintenanceEnabled ? "Enabled" : "Disabled"}
      />

      <div className="space-y-2">
        <label className="text-xs font-semibold text-white/80">Message (optional)</label>
        <textarea
          className="w-full rounded-md border border-white/10 bg-slate-950/60 p-3 text-sm text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
          rows={2}
          value={maintenanceMessage}
          onChange={(e) => onMaintenanceMessageChange(e.target.value)}
          placeholder="e.g. Maintenance window while Sonarr upgrades."
          disabled={!maintenanceEnabled || maintenanceLoading || savingMaintenance}
        />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSave}
          className="btn"
          disabled={savingMaintenance || maintenanceLoading}
        >
          {savingMaintenance ? "Saving..." : "Save maintenance mode"}
        </button>
      </div>
    </section>
  );
}
