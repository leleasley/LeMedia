import { AdaptiveSelect, type AdaptiveSelectOption } from "@/components/ui/adaptive-select";

type SessionSchedulingSectionProps = {
  sessionDays: number | "";
  settingsLoading: boolean;
  jobTimezone: string;
  timezoneOptions: string[];
  autoExpiryEnabled: boolean;
  autoExpiryDays: number | "";
  onSessionDaysChange: (nextValue: number | "") => void;
  onJobTimezoneChange: (nextValue: string) => void;
  onAutoExpiryEnabledChange: (nextValue: boolean) => void;
  onAutoExpiryDaysChange: (nextValue: number | "") => void;
};

export function SessionSchedulingSection({
  sessionDays,
  settingsLoading,
  jobTimezone,
  timezoneOptions,
  autoExpiryEnabled,
  autoExpiryDays,
  onSessionDaysChange,
  onJobTimezoneChange,
  onAutoExpiryEnabledChange,
  onAutoExpiryDaysChange,
}: SessionSchedulingSectionProps) {
  return (
    <section className="rounded-md border border-white/10 bg-slate-900/60 p-4 space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Sessions & Jobs</p>
        <h3 className="text-sm font-semibold text-white">Session & Scheduling Defaults</h3>
      </div>

      <div>
        <label className="text-sm font-semibold text-white">Session duration (days)</label>
        <div className="mt-2">
          <input
            type="number"
            min={1}
            value={sessionDays}
            onChange={(e) => onSessionDaysChange(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full sm:w-36 input"
            disabled={settingsLoading}
          />
        </div>
        <p className="text-xs text-muted mt-1">Set how long users remain signed in by default.</p>
        {!settingsLoading && sessionDays === "" ? (
          <p className="mt-2 text-xs text-destructive">Unable to load current value or you are not authorized.</p>
        ) : null}
      </div>

      <div>
        <label className="text-sm font-semibold text-white">Job schedule timezone</label>
        <div className="mt-2">
          <AdaptiveSelect
            value={jobTimezone || "__system__"}
            onValueChange={(value) => onJobTimezoneChange(value === "__system__" ? "" : value)}
            disabled={settingsLoading}
            options={[
              { value: "__system__", label: "System default (server timezone)" },
              ...(jobTimezone && !timezoneOptions.includes(jobTimezone)
                ? [{ value: jobTimezone, label: jobTimezone } as AdaptiveSelectOption]
                : []),
              ...timezoneOptions.map((zone) => ({ value: zone, label: zone })),
            ]}
            className="w-full max-w-md"
          />
        </div>
        <p className="text-xs text-muted mt-1">Controls cron-based jobs like the weekly digest schedule.</p>
      </div>

      <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <label className="text-sm font-semibold text-white">Auto-expire stale pending requests</label>
            <p className="text-xs text-muted mt-1">
              Disabled by default. When enabled, pending requests older than the configured number of days are automatically denied.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoExpiryEnabled}
            disabled={settingsLoading}
            onClick={() => onAutoExpiryEnabledChange(!autoExpiryEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${autoExpiryEnabled ? "bg-emerald-500" : "bg-white/20"} ${settingsLoading ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${autoExpiryEnabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>

        <div>
          <label className="text-sm font-semibold text-white">Auto-expiry threshold (days)</label>
          <div className="mt-2">
            <input
              type="number"
              min={1}
              max={365}
              value={autoExpiryDays}
              onChange={(e) => onAutoExpiryDaysChange(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full sm:w-36 input"
              disabled={settingsLoading}
            />
          </div>
          <p className="text-xs text-muted mt-1">Only applies when auto-expiry is enabled.</p>
        </div>
      </div>
    </section>
  );
}
