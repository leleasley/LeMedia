"use client";

import useSWR from "swr";
import { useState, useEffect, useCallback } from "react";
import {
  PlayIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/solid";
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

// ─── Types ───────────────────────────────────────────────────────────────────

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

type JobRuntimeMetric = {
  name: string;
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  successRate: number;
  failureRate: number;
  avgDurationMs: number;
  lastDurationMs: number | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastResult: "success" | "failure" | "none";
  lastError: string | null;
};

type JobMetricsResponse = {
  summary: {
    totalJobsTracked: number;
    totalRuns: number;
    totalSuccess: number;
    totalFailed: number;
    successRate: number;
    avgDurationMs: number;
  };
  metrics: JobRuntimeMetric[];
  runningJobs: string[];
};

type JobHistoryEntry = {
  id: number;
  jobName?: string;
  job_name?: string;
  status: "success" | "failure";
  startedAt?: string;
  started_at?: string;
  finishedAt?: string | null;
  finished_at?: string | null;
  durationMs?: number | null;
  duration_ms?: number | null;
  error: string | null;
  details: string | null;
};

type JobHistoryResponse = {
  entries: JobHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then((res) => res.json());

function formatInterval(seconds: number): string {
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400} day${seconds / 86400 > 1 ? "s" : ""}`;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} hour${seconds / 3600 > 1 ? "s" : ""}`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} minute${seconds / 60 > 1 ? "s" : ""}`;
  return `${seconds} seconds`;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "\u2014";
  const roundedMs = Math.round(ms);
  if (roundedMs < 1000) return `${roundedMs}ms`;
  if (roundedMs < 60000) {
    const seconds = Number((roundedMs / 1000).toFixed(1));
    return `${seconds}s`;
  }
  return `${Math.floor(roundedMs / 60000)}m ${Math.round((roundedMs % 60000) / 1000)}s`;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) {
    const absDiff = Math.abs(diffMs);
    if (absDiff < 60000) return `in ${Math.round(absDiff / 1000)}s`;
    if (absDiff < 3600000) return `in ${Math.round(absDiff / 60000)}m`;
    if (absDiff < 86400000) return `in ${Math.round(absDiff / 3600000)}h`;
    return `in ${Math.round(absDiff / 86400000)}d`;
  }
  if (diffMs < 60000) return `${Math.round(diffMs / 1000)}s ago`;
  if (diffMs < 3600000) return `${Math.round(diffMs / 60000)}m ago`;
  if (diffMs < 86400000) return `${Math.round(diffMs / 3600000)}h ago`;
  return `${Math.round(diffMs / 86400000)}d ago`;
}

// ─── Live countdown component ────────────────────────────────────────────────

function formatCountdown(targetMs: number, nowMs: number): string {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return "now";
  const totalSec = Math.floor(diffMs / 1000);
  if (totalSec < 60) return `in ${totalSec}s`;
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) {
    return hours > 0 ? `in ${days}d ${hours}h ${minutes}m` : `in ${days}d ${minutes}m`;
  }
  if (hours > 0) {
    return `in ${hours}h ${minutes}m ${seconds}s`;
  }
  return `in ${minutes}m ${seconds}s`;
}

function Countdown({ target }: { target: string }) {
  const targetMs = new Date(target).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const text = formatCountdown(targetMs, now);
  const isPast = targetMs <= now;

  return (
    <span className={isPast ? "text-amber-400 animate-pulse" : undefined}>
      {isPast ? "due" : text}
    </span>
  );
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

// ─── Schedule helpers ────────────────────────────────────────────────────────

function parseCronSchedule(schedule: string) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const isField = (value: string) => value === "*" || /^\d+$/.test(value) || /^\*\/\d+$/.test(value);
  if (![minute, hour, dayOfMonth, month, dayOfWeek].every(isField)) return null;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

function formatTime(hour: string, minute: string) {
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

function formatSchedule(job: Job): string {
  const cron = parseCronSchedule(job.schedule);
  if (!cron) return formatInterval(job.intervalSeconds);

  // Handle step patterns: */N minute or */N hour
  const minuteStep = cron.minute.match(/^\*\/(\d+)$/);
  const hourStep = cron.hour.match(/^\*\/(\d+)$/);

  if (minuteStep && cron.hour === "*" && cron.dayOfMonth === "*" && cron.dayOfWeek === "*") {
    return `${Number(minuteStep[1])} minutes`;
  }
  if (hourStep && /^\d+$/.test(cron.minute) && cron.dayOfMonth === "*" && cron.dayOfWeek === "*") {
    const h = Number(hourStep[1]);
    return h === 1 ? "Every hour" : `${h} hours`;
  }

  // Fixed time patterns require numeric hour and minute
  if (!/^\d+$/.test(cron.hour) || !/^\d+$/.test(cron.minute)) {
    return `Custom (${job.schedule})`;
  }
  const time = formatTime(cron.hour, cron.minute);
  if (cron.dayOfMonth === "*" && cron.dayOfWeek === "*" && cron.month === "*") {
    return `Daily at ${time}`;
  }
  if (cron.dayOfMonth === "*" && cron.month === "*" && cron.dayOfWeek !== "*") {
    const label = WEEK_DAYS.find((day) => day.value === cron.dayOfWeek)?.label ?? "Weekly";
    return `Weekly on ${label} at ${time}`;
  }
  if (cron.dayOfMonth !== "*" && cron.month === "*" && cron.dayOfWeek === "*") {
    return `Monthly on day ${cron.dayOfMonth} at ${time}`;
  }
  return `Custom (${job.schedule})`;
}

// ─── Status indicator ────────────────────────────────────────────────────────

function StatusDot({ status }: { status: "success" | "failure" | "running" | "disabled" | "idle" }) {
  const colors = {
    success: "bg-emerald-400",
    failure: "bg-red-400",
    running: "bg-blue-400 animate-pulse",
    disabled: "bg-gray-500",
    idle: "bg-gray-400",
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status]}`} />;
}

// ─── Job card component ──────────────────────────────────────────────────────

function JobCard({
  job,
  metric,
  running,
  serverRunning,
  onRun,
  onEdit,
  onEnable,
  onViewLogs,
}: {
  job: Job;
  metric: JobRuntimeMetric | undefined;
  running: boolean;
  serverRunning: boolean;
  onRun: () => void;
  onEdit: () => void;
  onEnable: () => void;
  onViewLogs: () => void;
}) {
  const isExecuting = running || serverRunning;

  const getStatus = (): "success" | "failure" | "running" | "disabled" | "idle" => {
    if (!job.enabled) return "disabled";
    if (isExecuting) return "running";
    if (metric?.lastResult === "failure") return "failure";
    if (metric?.lastResult === "success") return "success";
    return "idle";
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="p-4">
        {/* Header row */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
            <StatusDot status={getStatus()} />
            <h3 className="font-semibold text-white truncate basis-full sm:basis-auto">{job.name}</h3>
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                job.type === "system" ? "bg-blue-500/20 text-blue-300" : "bg-green-500/20 text-green-300"
              }`}
            >
              {job.type}
            </span>
            {!job.enabled && (
              <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/20 text-red-300">
                disabled
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
            <button
              onClick={onViewLogs}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-300 transition-colors flex-1 sm:flex-none"
            >
              Logs
            </button>
            <button
              onClick={onEdit}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-300 transition-colors flex-1 sm:flex-none"
            >
              Edit
            </button>
            {!job.enabled ? (
              <button
                onClick={onEnable}
                disabled={running}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 flex-1 sm:flex-none"
              >
                Re-enable
              </button>
            ) : (
              <button
                onClick={onRun}
                disabled={running || isExecuting}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50 flex-1 sm:flex-none"
              >
                <PlayIcon className="h-3 w-3" />
                {isExecuting ? "Running..." : "Run Now"}
              </button>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-medium">Schedule</div>
            <div className="text-sm text-gray-200 flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              {formatSchedule(job)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-medium">Last Run</div>
            <div className="text-sm text-gray-200">
              {job.lastRun && new Date(job.lastRun).getFullYear() > 1970
                ? formatRelativeTime(job.lastRun)
                : "Never"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-medium">Next Run</div>
            <div className="text-sm text-gray-200">
              {isExecuting ? (
                <span className="text-blue-400 animate-pulse flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Running...
                </span>
              ) : job.nextRun ? <Countdown target={job.nextRun} /> : "\u2014"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-gray-500 font-medium">Avg Duration</div>
            <div className="text-sm text-gray-200">
              {metric ? formatDuration(metric.avgDurationMs) : "\u2014"}
            </div>
          </div>
        </div>

        {/* Error/disabled info */}
        {(job.disabledReason || job.lastError) && (
          <div className="mt-3 space-y-1">
            {job.disabledReason && (
              <div className="text-xs text-red-300 bg-red-500/10 rounded-lg px-3 py-1.5">
                {job.disabledReason}
              </div>
            )}
            {job.lastError && (
              <div className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-1.5 font-mono break-all">
                {job.lastError}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Execution log panel ─────────────────────────────────────────────────────

function ExecutionLog({
  jobFilter,
  onClose,
}: {
  jobFilter: string | null;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [filterJob, setFilterJob] = useState(jobFilter);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const pageSize = 25;

  const queryParams = new URLSearchParams();
  if (filterJob) queryParams.set("job", filterJob);
  queryParams.set("limit", String(pageSize));
  queryParams.set("offset", String(page * pageSize));

  const { data, error, isLoading, mutate } = useSWR<JobHistoryResponse>(
    `/api/v1/admin/jobs/history?${queryParams.toString()}`,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: true }
  );

  const { data: allJobs } = useSWR<Job[]>("/api/v1/admin/jobs", fetcher);
  const jobNames = allJobs?.map((j) => j.name).sort() ?? [];

  // Track seen IDs so we can highlight new entries
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());
  const [newIds, setNewIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!data?.entries?.length) return;
    const currentIds = new Set(data.entries.map((e) => e.id));
    let clearHighlightTimer: ReturnType<typeof setTimeout> | undefined;

    setSeenIds((previousSeenIds) => {
      if (previousSeenIds.size > 0) {
        const fresh = new Set<number>();
        for (const id of currentIds) {
          if (!previousSeenIds.has(id)) fresh.add(id);
        }
        if (fresh.size > 0) {
          setNewIds(fresh);
          clearHighlightTimer = setTimeout(() => setNewIds(new Set()), 3000);
        }
      }
      return currentIds;
    });

    return () => {
      if (clearHighlightTimer) clearTimeout(clearHighlightTimer);
    };
  }, [data?.entries]);

  const toast = useToast();
  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Client-side status filter
  const filtered = filterStatus ? entries.filter((e) => e.status === filterStatus) : entries;

  const clearLogs = async () => {
    setClearing(true);
    try {
      const url = filterJob
        ? `/api/v1/admin/jobs/history?job=${encodeURIComponent(filterJob)}`
        : `/api/v1/admin/jobs/history`;
      const res = await csrfFetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear logs");
      const result = await res.json();
      toast.success(`Cleared ${result.deleted} log${result.deleted !== 1 ? "s" : ""}`);
      setPage(0);
      mutate();
    } catch {
      toast.error("Failed to clear logs");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-white/10">
        <div className="flex items-center gap-3 min-w-0">
          <h3 className="text-lg font-semibold text-white">
            Execution History
            {filterJob && <span className="text-indigo-400 ml-1.5 font-normal text-sm">({filterJob})</span>}
          </h3>
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium uppercase tracking-wider">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-sm transition-colors"
        >
          Close
        </button>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-white/10 flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-gray-400">Job:</label>
          <div className="min-w-[180px] flex-1 sm:flex-none">
            <Select
              value={filterJob ?? "all"}
              onValueChange={(value) => {
                setFilterJob(value === "all" ? null : value);
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="All Jobs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                {jobNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-gray-400">Status:</label>
          <div className="flex gap-1 flex-wrap">
            {[
              { label: "All", value: null },
              { label: "Success", value: "success" },
              { label: "Failed", value: "failure" },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setFilterStatus(opt.value)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === opt.value
                    ? "bg-indigo-600 text-white"
                    : "bg-white/5 text-gray-300 hover:bg-white/10"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:ml-auto flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500">{total} total entries</span>
          {total > 0 && (
            <button
              onClick={clearLogs}
              disabled={clearing}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-500/10 text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {clearing ? "Clearing..." : filterJob ? `Clear ${filterJob} logs` : "Clear all logs"}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading history...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">Failed to load history</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No execution history recorded yet. Jobs will appear here after their next run.
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-white/10">
              {filtered.map((entry) => {
                const jobLabel = entry.jobName ?? entry.job_name ?? "Unknown job";
                const started = entry.startedAt ?? entry.started_at ?? null;
                const finished = entry.finishedAt ?? entry.finished_at ?? null;
                const duration = entry.durationMs ?? entry.duration_ms ?? null;
                const startedDate = started ? new Date(started) : null;
                const startedIsValid = !!(startedDate && !Number.isNaN(startedDate.getTime()));
                const startedDisplay = startedIsValid && startedDate ? startedDate.toLocaleString() : "\u2014";
                const startedRelative = startedIsValid && started ? formatRelativeTime(started) : "\u2014";

                return (
                  <div
                    key={entry.id}
                    className={`p-3 space-y-2 transition-colors duration-700 ${
                      newIds.has(entry.id) ? "bg-indigo-500/10" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white truncate">{jobLabel}</div>
                      {entry.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-medium">
                          <CheckCircleIcon className="h-4 w-4" />OK
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                          <XCircleIcon className="h-4 w-4" />FAIL
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500 uppercase text-[10px]">Started</div>
                        <div className="text-gray-300">{startedDisplay}</div>
                        <div className="text-gray-500 text-[10px]">{startedRelative}</div>
                      </div>
                      <div>
                        <div className="text-gray-500 uppercase text-[10px]">Duration</div>
                        <div className="text-gray-300 font-mono">{formatDuration(duration)}</div>
                      </div>
                    </div>
                    {(entry.details || entry.error) && (
                      <div className="rounded-lg bg-black/30 p-2 text-xs font-mono break-all space-y-1">
                        {entry.details && (
                          <div className="text-gray-300">
                            <span className="text-gray-500">Result: </span>
                            {entry.details}
                          </div>
                        )}
                        {entry.error && (
                          <div className="text-red-300">
                            <span className="text-gray-500">Error: </span>
                            {entry.error}
                          </div>
                        )}
                        {finished && (
                          <div className="text-gray-500">
                            Finished: {new Date(finished).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <table className="w-full text-sm hidden md:table">
            <thead>
              <tr className="text-left text-[10px] uppercase text-gray-500 border-b border-white/5">
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                (() => {
                  const jobLabel = entry.jobName ?? entry.job_name ?? "Unknown job";
                  const started = entry.startedAt ?? entry.started_at ?? null;
                  const finished = entry.finishedAt ?? entry.finished_at ?? null;
                  const duration = entry.durationMs ?? entry.duration_ms ?? null;
                  const startedDate = started ? new Date(started) : null;
                  const startedIsValid = !!(startedDate && !Number.isNaN(startedDate.getTime()));
                  const startedDisplay = startedIsValid && startedDate ? startedDate.toLocaleString() : "\u2014";
                  const startedRelative = startedIsValid && started ? formatRelativeTime(started) : "\u2014";

                  return (
                <tr
                  key={entry.id}
                  className={`border-b border-white/5 last:border-0 transition-colors duration-700 ${
                    newIds.has(entry.id)
                      ? "bg-indigo-500/10"
                      : "hover:bg-white/[0.02]"
                  }`}
                >
                  <td className="px-4 py-2.5">
                    {entry.status === "success" ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircleIcon className="h-4 w-4" />
                        <span className="text-xs font-medium">OK</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400">
                        <XCircleIcon className="h-4 w-4" />
                        <span className="text-xs font-medium">FAIL</span>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-200 font-medium">{jobLabel}</td>
                  <td className="px-4 py-2.5 text-gray-300">
                    <div className="text-xs">{startedDisplay}</div>
                    <div className="text-[10px] text-gray-500">{startedRelative}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-300 font-mono text-xs">
                    {formatDuration(duration)}
                  </td>
                  <td className="px-4 py-2.5">
                    {entry.details || entry.error ? (
                      <button
                        onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
                      >
                        {entry.error ? (
                          <span className="text-red-300 truncate max-w-[200px]">{entry.error}</span>
                        ) : (
                          <span className="text-gray-300 truncate max-w-[200px]">{entry.details}</span>
                        )}
                        {expandedRow === entry.id ? (
                          <ChevronUpIcon className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronDownIcon className="h-3 w-3 shrink-0" />
                        )}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-600">{"\u2014"}</span>
                    )}
                    {expandedRow === entry.id && (entry.details || entry.error) && (
                      <div className="mt-2 rounded-lg bg-black/30 p-3 text-xs font-mono break-all space-y-1">
                        {entry.details && (
                          <div className="text-gray-300">
                            <span className="text-gray-500">Result: </span>
                            {entry.details}
                          </div>
                        )}
                        {entry.error && (
                          <div className="text-red-300">
                            <span className="text-gray-500">Error: </span>
                            {entry.error}
                          </div>
                        )}
                        {finished && (
                          <div className="text-gray-500">
                            Finished: {new Date(finished).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                  );
                })()
              ))}
            </tbody>
            </table>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t border-white/10">
          <button
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 text-gray-300 disabled:opacity-30 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function JobsListClient() {
  const { data: jobs, error, mutate } = useSWR<Job[]>("/api/v1/admin/jobs", fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });
  const { data: runtimeData } = useSWR<JobMetricsResponse>("/api/v1/admin/jobs/metrics", fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: true,
  });
  const toast = useToast();
  const [running, setRunning] = useState<number | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [editInterval, setEditInterval] = useState<number>(300);
  const [scheduleMode, setScheduleMode] = useState<(typeof SCHEDULE_MODES)[number]["value"]>("interval");
  const [timeValue, setTimeValue] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [customCron, setCustomCron] = useState("");

  // Log view state
  const [activeTab, setActiveTab] = useState<"jobs" | "logs">("jobs");
  const [logJobFilter, setLogJobFilter] = useState<string | null>(null);

  const openLogsFor = (jobName: string | null) => {
    setLogJobFilter(jobName);
    setActiveTab("logs");
  };

  const startEdit = (job: Job) => {
    setEditJob(job);
    setEditInterval(job.intervalSeconds);
    const cron = parseCronSchedule(job.schedule);
    if (cron) {
      // If any field uses a step pattern (*/N), show as custom cron
      const hasStep = [cron.minute, cron.hour, cron.dayOfMonth, cron.dayOfWeek]
        .some(f => /^\*\/\d+$/.test(f));
      if (hasStep) {
        setScheduleMode("custom");
        setCustomCron(job.schedule);
      } else {
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

    const preset = FREQUENCY_PRESETS.find((p) => p.value === editInterval);
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
        body: JSON.stringify({ id: editJob.id, schedule, intervalSeconds }),
      });
      if (!res.ok) throw new Error("Failed to update job");
      toast.success("Job updated");
      setEditJob(null);
      mutate();
    } catch (e) {
      toast.error("Failed to update job");
    }
  };

  if (!jobs && !error)
    return <div className="text-muted p-4">Loading jobs...</div>;
  if (error) return <div className="text-red-500 p-4">Failed to load jobs</div>;

  const metricsByName = new Map((runtimeData?.metrics ?? []).map((item) => [item.name, item]));
  const serverRunningSet = new Set(runtimeData?.runningJobs ?? []);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      {runtimeData?.summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Total Runs</div>
            <div className="text-xl font-bold text-white mt-0.5">{runtimeData.summary.totalRuns}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Success Rate</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">
              {(runtimeData.summary.successRate * 100).toFixed(1)}%
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Failed</div>
            <div className="text-xl font-bold text-red-400 mt-0.5">{runtimeData.summary.totalFailed}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className="text-[10px] text-gray-500 uppercase font-medium">Avg Duration</div>
            <div className="text-xl font-bold text-blue-300 mt-0.5">
              {formatDuration(runtimeData.summary.avgDurationMs)}
            </div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-white/10 pb-0">
        <button
          onClick={() => setActiveTab("jobs")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "jobs"
              ? "border-indigo-500 text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Jobs ({jobs?.length ?? 0})
        </button>
        <button
          onClick={() => {
            setLogJobFilter(null);
            setActiveTab("logs");
          }}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            activeTab === "logs"
              ? "border-indigo-500 text-white"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Execution Log
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "jobs" && (
        <div className="space-y-3">
          {jobs?.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              metric={metricsByName.get(job.name)}
              running={running === job.id}
              serverRunning={serverRunningSet.has(job.name)}
              onRun={() => runJob(job)}
              onEdit={() => startEdit(job)}
              onEnable={() => enableJob(job)}
              onViewLogs={() => openLogsFor(job.name)}
            />
          ))}
        </div>
      )}

      {activeTab === "logs" && (
        <ExecutionLog jobFilter={logJobFilter} onClose={() => setActiveTab("jobs")} />
      )}

      {/* Edit modal */}
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
                    {!FREQUENCY_PRESETS.some((p) => p.value === editInterval) && (
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
