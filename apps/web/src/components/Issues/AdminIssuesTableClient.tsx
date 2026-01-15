"use client";

import useSWR from "swr";
import { formatDate } from "@/lib/dateFormat";
import { AdminIssueActions } from "@/components/Issues/AdminIssueActions";

type MediaIssue = {
  id: string;
  media_type: string;
  tmdb_id: number;
  title: string;
  category: string;
  description: string;
  reporter_id: number;
  status: string;
  created_at: string;
  reporter_username?: string | null;
};

export function AdminIssuesTableClient({ initialIssues }: { initialIssues: MediaIssue[] }) {
  const { data } = useSWR<{ issues: MediaIssue[] }>(
    "/api/v1/issues",
    {
      refreshInterval: 30000,
      revalidateOnFocus: true,
      fallbackData: { issues: initialIssues },
    }
  );

  const issues = data?.issues ?? initialIssues;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 shadow-xl overflow-hidden">
      {issues.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted">No issues have been reported yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left">
              <tr>
                <th className="p-4 font-semibold">Title</th>
                <th className="p-4 font-semibold">Type</th>
                <th className="p-4 font-semibold">Category</th>
                <th className="p-4 font-semibold">Reporter</th>
                <th className="p-4 font-semibold">Submitted</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Details</th>
                <th className="p-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {issues.map(issue => (
                <tr key={issue.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-white">{issue.title}</div>
                    <div className="text-xs text-muted">TMDB {issue.tmdb_id}</div>
                  </td>
                  <td className="p-4 text-white/80">{issue.media_type.toUpperCase()}</td>
                  <td className="p-4 text-white/80">{issue.category}</td>
                  <td className="p-4 text-white/80">{issue.reporter_username ?? "Unknown"}</td>
                  <td className="p-4 text-white/70 whitespace-nowrap">{formatDate(issue.created_at)}</td>
                  <td className="p-4">
                    <span className={issue.status === "resolved" ? "text-emerald-200" : "text-amber-200"}>
                      {issue.status === "resolved" ? "Resolved" : "Open"}
                    </span>
                  </td>
                  <td className="p-4 text-white/80 max-w-md">
                    <div className="line-clamp-3">{issue.description}</div>
                  </td>
                  <td className="p-4">
                    <AdminIssueActions issueId={issue.id} status={issue.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
