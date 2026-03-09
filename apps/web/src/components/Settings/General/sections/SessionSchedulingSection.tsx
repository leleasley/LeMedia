import { AdaptiveSelect, type AdaptiveSelectOption } from "@/components/ui/adaptive-select";

type SessionSchedulingSectionProps = {
  sessionDays: number | "";
  settingsLoading: boolean;
  jobTimezone: string;
  timezoneOptions: string[];
  onSessionDaysChange: (nextValue: number | "") => void;
  onJobTimezoneChange: (nextValue: string) => void;
};

export function SessionSchedulingSection({
  sessionDays,
  settingsLoading,
  jobTimezone,
  timezoneOptions,
  onSessionDaysChange,
  onJobTimezoneChange,
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
    </section>
  );
}
