"use client";

import useSWR from "swr";
import { useState } from "react";
import { PlayIcon, ClockIcon } from "@heroicons/react/24/solid";
import { useToast } from "@/components/Providers/ToastProvider";
import { Modal } from "@/components/Common/Modal";
import { csrfFetch } from "@/lib/csrf-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Job = {
  id: number;
  name: string;
  schedule: string;
  intervalSeconds: number;
  type: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  runOnStart: boolean;
  failureCount: number;
  lastError: string | null;
  disabledReason: string | null;
};

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => res.json());

function formatInterval(seconds: number): string {
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400} day${seconds / 86400 > 1 ? 's' : ''}`;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 > 1 ? 's' : ''}`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} minute${seconds / 60 > 1 ? 's' : ''}`;
  return `${seconds} seconds`;
}

const FREQUENCY_PRESETS = [
  { label: "2 Minutes", value: 120 },
  { label: "5 Minutes", value: 300 },
  { label: "10 Minutes", value: 600 },
  { label: "15 Minutes", value: 900 },
  { label: "30 Minutes", value: 1800 },
  { label: "1 Hour", value: 3600 },
  { label: "6 Hours", value: 21600 },
  { label: "12 Hours", value: 43200 },
  { label: "Daily", value: 86400 },
  { label: "Weekly", value: 604800 },
];

const SCHEDULE_MODES = [
  { label: "Every X minutes/hours", value: "interval" },
  { label: "Daily at a time", value: "daily" },
  { label: "Weekly at a time", value: "weekly" },
  { label: "Monthly at a time", value: "monthly" },
  { label: "Custom cron", value: "custom" },
] as const;

const WEEK_DAYS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" },
];

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => ({
  label: `${i + 1}`,
  value: `${i + 1}`,
}));

function parseCronSchedule(schedule: string) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const isField = (value: string) => value === "*" || /^\d+$/.test(value);
  if (![minute, hour, dayOfMonth, month, dayOfWeek].every(isField)) return null;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function formatTime(hour: string, minute: string) {
  const h = hour.padStart(2, "0");
  const m = minute.padStart(2, "0");
  return `${h}:${m}`;
}

function formatSchedule(job: Job): string {
  const cron = parseCronSchedule(job.schedule);
  if (!cron) return formatInterval(job.intervalSeconds);
  const time = formatTime(cron.hour, cron.minute);
  if (cron.dayOfMonth === "*" && cron.dayOfWeek === "*" && cron.month === "*") {
    return `Daily at ${time}`;
  }
  if (cron.dayOfMonth === "*" && cron.month === "*" && cron.dayOfWeek !== "*") {
    const label = WEEK_DAYS.find(day => day.value === cron.dayOfWeek)?.label ?? "Weekly";
    return `Weekly on ${label} at ${time}`;
  }
  if (cron.dayOfMonth !== "*" && cron.month === "*" && cron.dayOfWeek === "*") {
    return `Monthly on day ${cron.dayOfMonth} at ${time}`;
  }
  return `Custom (${job.schedule})`;
}

export function JobsListClient() {
  const { data: jobs, error, mutate } = useSWR<Job[]>("/api/v1/admin/jobs", fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });
  const toast = useToast();
  const [running, setRunning] = useState<number | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [editInterval, setEditInterval] = useState<number>(300);
  const [scheduleMode, setScheduleMode] = useState<typeof SCHEDULE_MODES[number]["value"]>("interval");
  const [timeValue, setTimeValue] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [customCron, setCustomCron] = useState("");

  const startEdit = (job: Job) => {
    setEditJob(job);
    setEditInterval(job.intervalSeconds);
    const cron = parseCronSchedule(job.schedule);
    if (cron) {
      const time = formatTime(cron.hour, cron.minute);
      setTimeValue(time);
      if (cron.dayOfMonth === "*" && cron.dayOfWeek === "*" && cron.month === "*") {
        setScheduleMode("daily");
      } else if (cron.dayOfMonth === "*" && cron.dayOfWeek !== "*" && cron.month === "*") {
        setScheduleMode("weekly");
        setDayOfWeek(cron.dayOfWeek);
      } else if (cron.dayOfMonth !== "*" && cron.dayOfWeek === "*" && cron.month === "*") {
        setScheduleMode("monthly");
        setDayOfMonth(cron.dayOfMonth);
      } else {
        setScheduleMode("custom");
        setCustomCron(job.schedule);
      }
    } else {
      setScheduleMode("interval");
      setCustomCron("");
    }
  };

  const runJob = async (job: Job) => {
    setRunning(job.id);
    try {
      const res = await csrfFetch(`/api/v1/admin/jobs/${job.id}/run`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start job");
      toast.success(`Job ${job.name} started`);
      // Wait a bit before mutating to allow job to potentially update lastRun/nextRun in DB immediately if fast
      setTimeout(() => mutate(), 1000);
    } catch (e) {
      toast.error("Failed to run job");
    } finally {
      setRunning(null);
    }
  };

  const enableJob = async (job: Job) => {
    setRunning(job.id);
    try {
      const res = await csrfFetch(`/api/v1/admin/jobs/${job.id}/enable`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to enable job");
      toast.success(`Job ${job.name} re-enabled`);
      setTimeout(() => mutate(), 1000);
    } catch (e) {
      toast.error("Failed to re-enable job");
    } finally {
      setRunning(null);
    }
  };

  const saveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editJob) return;
    
    const preset = FREQUENCY_PRESETS.find(p => p.value === editInterval);
    const [hour, minute] = timeValue.split(":");
    let scheduleLabel = preset ? `Every ${preset.label}` : `Every ${editInterval} seconds`;
    let intervalSeconds = editInterval;
    let schedule = scheduleLabel;

    if (scheduleMode === "daily") {
      schedule = `${Number(minute)} ${Number(hour)} * * *`;
      intervalSeconds = 86400;
    } else if (scheduleMode === "weekly") {
      schedule = `${Number(minute)} ${Number(hour)} * * ${dayOfWeek}`;
      intervalSeconds = 604800;
    } else if (scheduleMode === "monthly") {
      schedule = `${Number(minute)} ${Number(hour)} ${dayOfMonth} * *`;
      intervalSeconds = 2592000;
    } else if (scheduleMode === "custom") {
      const trimmed = customCron.trim();
      if (trimmed.split(/\s+/).length !== 5) {
        toast.error("Custom cron must have 5 fields (min hour day month weekday)");
        return;
      }
      schedule = trimmed;
    }
    
    try {
      const res = await csrfFetch("/api/v1/admin/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editJob.id,
          schedule,
          intervalSeconds
        })
      });
      if (!res.ok) throw new Error("Failed to update job");
      toast.success("Job updated");
      setEditJob(null);
      mutate();
    } catch (e) {
      toast.error("Failed to update job");
    }
  };

  if (!jobs && !error) return <div className="text-muted p-4">Loading jobs...</div>;
  if (error) return <div className="text-red-500 p-4">Failed to load jobs</div>;

  return (
    <div className="space-y-4">
      {jobs?.map((job) => (
        <div key={job.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-lg text-white">{job.name}</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${job.type === 'system' ? 'bg-blue-500/20 text-blue-200' : 'bg-green-500/20 text-green-200'}`}>
                {job.type}
              </span>
              {!job.enabled && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/20 text-red-200">
                  disabled
                </span>
              )}
              {job.failureCount > 0 && job.enabled && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-200">
                  {job.failureCount} fail{job.failureCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-gray-400 space-y-1">
              <div className="flex items-center gap-2">
                <ClockIcon className="h-4 w-4" />
                <span>Schedule: <span className="text-white font-semibold">{formatSchedule(job)}</span></span>
              </div>
              <div>Last Run: {job.lastRun ? new Date(job.lastRun).toLocaleString() : "Never"}</div>
              <div>Next Run: {job.nextRun ? new Date(job.nextRun).toLocaleString() : "Pending..."}</div>
              {job.disabledReason ? (
                <div className="text-xs text-red-200">Reason: {job.disabledReason}</div>
              ) : null}
              {job.lastError ? (
                <div className="text-xs text-amber-200">Last error: {job.lastError}</div>
              ) : null}
            </div>
          </div>
          <div className="flex w-full sm:w-auto gap-3">
            <button
              onClick={() => startEdit(job)}
              className="flex-1 sm:flex-none justify-center px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => runJob(job)}
              disabled={running === job.id}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold transition-colors disabled:opacity-50 shadow-lg shadow-indigo-600/20"
            >
              <PlayIcon className="h-4 w-4" />
              <span>{running === job.id ? "Running..." : "Run Now"}</span>
            </button>
            {!job.enabled && (
              <button
                onClick={() => enableJob(job)}
                disabled={running === job.id}
                className="flex-1 sm:flex-none justify-center px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors disabled:opacity-50"
              >
                Re-enable
              </button>
            )}
          </div>
        </div>
      ))}

      {editJob && (
        <Modal open={true} title={`Edit ${editJob.name}`} onClose={() => setEditJob(null)}>
          <form onSubmit={saveJob} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-300">Schedule type</label>
              <Select
                value={scheduleMode}
                onValueChange={(value) => {
                  setScheduleMode(value as typeof scheduleMode);
                  if (value === "daily") setEditInterval(86400);
                  if (value === "weekly") setEditInterval(604800);
                  if (value === "monthly") setEditInterval(2592000);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select schedule type" />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-gray-400">Changes apply globally for all users.</p>
            </div>

            {scheduleMode === "interval" && (
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Run Every</label>
                <Select
                  value={editInterval.toString()}
                  onValueChange={(value) => setEditInterval(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_PRESETS.map((preset) => (
                      <SelectItem key={preset.value} value={preset.value.toString()}>
                        {preset.label}
                      </SelectItem>
                    ))}
                    {!FREQUENCY_PRESETS.some(p => p.value === editInterval) && (
                      <SelectItem value={editInterval.toString()}>
                        Custom ({formatInterval(editInterval)})
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {scheduleMode !== "interval" && scheduleMode !== "custom" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">Time</label>
                  <input
                    type="time"
                    value={timeValue}
                    onChange={(event) => setTimeValue(event.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                  />
                </div>
                {scheduleMode === "weekly" && (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Day of week</label>
                    <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_DAYS.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {scheduleMode === "monthly" && (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Day of month</label>
                    <Select value={dayOfMonth} onValueChange={setDayOfMonth}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_MONTH.map((day) => (
                          <SelectItem key={day.value} value={day.value}>
                            Day {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-2 text-xs text-gray-400">Limited to days 1-28 for monthly reliability.</p>
                  </div>
                )}
              </div>
            )}

            {scheduleMode === "custom" && (
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Cron expression</label>
                <input
                  value={customCron}
                  onChange={(event) => setCustomCron(event.target.value)}
                  placeholder="min hour day month weekday"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                />
                <p className="mt-2 text-xs text-gray-400">Use 5 fields: minute hour day month weekday.</p>
              </div>
            )}
            
            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => setEditJob(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white/10 text-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
              >
                Save Changes
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
