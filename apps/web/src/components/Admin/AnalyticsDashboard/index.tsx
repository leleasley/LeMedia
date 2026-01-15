"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Loader2, Calendar, TrendingUp, Users, CheckCircle2, XCircle, Clock } from "lucide-react";

interface Analytics {
  totalRequests: number;
  movieRequests: number;
  tvRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  deniedRequests: number;
  avgApprovalTimeHours: number;
  topRequesters: Array<{ username: string; count: number }>;
  requestsByDay: Array<{ date: string; count: number }>;
  requestsByStatus: Array<{ status: string; count: number }>;
}

const statusColors: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  available: { bg: "bg-emerald-500/20", text: "text-emerald-100", icon: "✓" },
  submitted: { bg: "bg-blue-500/20", text: "text-blue-100", icon: "→" },
  pending: { bg: "bg-sky-500/20", text: "text-sky-100", icon: "⏳" },
  denied: { bg: "bg-red-500/20", text: "text-red-100", icon: "✕" },
  failed: { bg: "bg-red-500/20", text: "text-red-100", icon: "!" },
  removed: { bg: "bg-slate-500/20", text: "text-slate-100", icon: "−" },
};

function StatCard({
  title,
  value,
  icon: Icon,
  subtext,
  variant = "default",
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className: string }>;
  subtext?: string;
  variant?: "default" | "success" | "warning" | "danger";
}) {
  const variantClasses = {
    default: "bg-gradient-to-br from-gray-800 to-gray-900 border-gray-700",
    success: "bg-gradient-to-br from-emerald-900/30 to-emerald-800/20 border-emerald-700/50",
    warning: "bg-gradient-to-br from-amber-900/30 to-amber-800/20 border-amber-700/50",
    danger: "bg-gradient-to-br from-red-900/30 to-red-800/20 border-red-700/50",
  };

  return (
    <div className={`rounded-xl border glass-strong p-6 ${variantClasses[variant]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-400 mb-2">{title}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {subtext && <p className="text-xs text-gray-500 mt-2">{subtext}</p>}
        </div>
        <Icon className="h-8 w-8 text-gray-500 opacity-50" />
      </div>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState<{
    start: string;
    end: string;
  }>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  });

  const params = new URLSearchParams();
  if (dateRange.start) params.append("startDate", dateRange.start);
  if (dateRange.end) params.append("endDate", dateRange.end);

  const { data, isLoading } = useSWR<{ analytics: Analytics }>(
    `/api/admin/analytics?${params}`,
    { revalidateOnFocus: false }
  );

  const analytics = data?.analytics;

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!analytics?.requestsByDay) return [];
    return analytics.requestsByDay.map((d) => ({
      date: new Date(d.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      count: d.count,
    }));
  }, [analytics]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-500" />
          <p className="text-gray-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return <div className="text-center py-12 text-gray-400">No data available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Date Range Picker */}
      <div className="flex gap-4 flex-wrap items-end">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Start Date
          </label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            End Date
          </label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Requests"
          value={analytics.totalRequests}
          icon={TrendingUp}
          subtext={`${analytics.movieRequests} movies • ${analytics.tvRequests} TV`}
        />
        <StatCard
          title="Approved"
          value={analytics.approvedRequests}
          icon={CheckCircle2}
          variant="success"
          subtext={`${((analytics.approvedRequests / analytics.totalRequests) * 100).toFixed(1)}% approval rate`}
        />
        <StatCard
          title="Denied"
          value={analytics.deniedRequests}
          icon={XCircle}
          variant="danger"
          subtext={`${((analytics.deniedRequests / analytics.totalRequests) * 100).toFixed(1)}% denied`}
        />
        <StatCard
          title="Avg Approval Time"
          value={`${analytics.avgApprovalTimeHours.toFixed(1)}h`}
          icon={Clock}
          variant="warning"
          subtext="Time to approval"
        />
      </div>

      {/* Top Requesters */}
      <div className="rounded-xl border glass-strong p-6 border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Top Requesters</h3>
        <div className="space-y-2">
          {analytics.topRequesters.length === 0 ? (
            <p className="text-gray-400 text-sm">No data</p>
          ) : (
            analytics.topRequesters.map((user, idx) => (
              <div
                key={user.username}
                className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium">{user.username}</p>
                </div>
                <div className="text-right">
                  <p className="text-white font-semibold">{user.count}</p>
                  <p className="text-xs text-gray-400">requests</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Requests by Status */}
      <div className="rounded-xl border glass-strong p-6 border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Status Breakdown</h3>
        <div className="space-y-2">
          {analytics.requestsByStatus.map((item) => {
            const color = statusColors[item.status] || statusColors.pending;
            const percentage = (item.count / analytics.totalRequests) * 100;
            return (
              <div key={item.status} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-lg ${color.text}`}>{color.icon}</span>
                    <span className="text-sm font-medium text-gray-300 capitalize">
                      {item.status}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-white">
                    {item.count} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full ${color.bg} transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Requests Trend Chart */}
      <div className="rounded-xl border glass-strong p-6 border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Requests Trend (Last 30 Days)
        </h3>
        <div className="h-64 flex items-end gap-1 p-4 bg-white/5 rounded-lg overflow-x-auto">
          {chartData.length === 0 ? (
            <p className="text-gray-400 text-sm flex items-center justify-center w-full">
              No data
            </p>
          ) : (
            chartData.map((item, idx) => {
              const maxCount = Math.max(...chartData.map((d) => d.count), 1);
              const height = (item.count / maxCount) * 100;
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center gap-2 min-w-[30px]"
                  title={`${item.date}: ${item.count} requests`}
                >
                  <div className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t opacity-80 hover:opacity-100 transition-opacity flex-1 min-h-[4px]" style={{ height: `${height}%` }} />
                  <span className="text-[10px] text-gray-500 text-center">{item.date}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
