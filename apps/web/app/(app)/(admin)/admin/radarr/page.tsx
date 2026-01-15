import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { listRadarrMovies, radarrLogs, radarrQueue, radarrStatus } from "@/lib/radarr";
import { formatDate } from "@/lib/dateFormat";
import { getActiveMediaService } from "@/lib/media-services";

export const metadata = {
  title: "Radarr - LeMedia",
};

const displayValue = (value: unknown, fallback = "—") =>
  value === undefined || value === null ? fallback : String(value);

export default async function RadarrAdminPage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }
  if (!user.isAdmin) {
    return (
      <div className="glass-strong rounded-2xl p-6">
        <div className="text-lg font-bold text-text">Forbidden</div>
        <div className="mt-2 text-sm text-muted">You’re not in the admin group.</div>
      </div>
    );
  }

  const safe = async <T,>(fn: () => Promise<T>) => {
    try {
      return { ok: true as const, data: await fn() };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? String(e) };
    }
  };

  const radarrService = await getActiveMediaService("radarr");

  const [statusRes, moviesRes, queueRes, logsRes] = await Promise.all([
    safe(() => radarrStatus()),
    safe(() => listRadarrMovies()),
    safe(() => radarrQueue(1, 20)),
    safe(() => radarrLogs(1, 30))
  ]);

  const movies: any[] = moviesRes.ok && Array.isArray(moviesRes.data) ? moviesRes.data : [];
  const recentMovies = [...movies]
    .sort((a, b) => new Date(b?.added ?? 0).getTime() - new Date(a?.added ?? 0).getTime())
    .slice(0, 20);

  const totalMovies = movies.length;
  const missingMovies = movies.filter(m => !m?.hasFile).length;
  const monitoredMovies = movies.filter(m => m?.monitored).length;

  const queueRecords: any[] = queueRes.ok ? ((queueRes.data as any)?.records ?? []) : [];
  const logRecords: any[] = logsRes.ok ? ((logsRes.data as any)?.records ?? []) : [];

  return (
    <div className="space-y-4 px-3 md:px-8 pb-4 md:pb-8">
      <h1 className="text-2xl md:text-2xl font-bold text-text">Radarr</h1>

      <div className="flex flex-wrap gap-2 text-xs md:text-sm">
        <a className="btn text-sm" href="#overview">Overview</a>
        <a className="btn text-sm" href="#library">Library</a>
        <a className="btn text-sm" href="#queue">Queue</a>
        <a className="btn text-sm" href="#logs">Logs</a>
      </div>

      <div id="overview" className="grid gap-4 md:grid-cols-2">
        <div className="glass-strong rounded-xl md:rounded-2xl p-3 md:p-4">
          <h2 className="text-base md:text-lg font-semibold text-text mb-2">System status</h2>
          {!statusRes.ok ? (
            <div className="text-xs md:text-sm text-amber-100">Unable to reach Radarr: {statusRes.error}</div>
          ) : (
            <div className="text-xs md:text-sm text-muted space-y-1">
              <div><span className="text-muted">App:</span> {(statusRes.data as any).appName} {(statusRes.data as any).version}</div>
              <div><span className="text-muted">OS:</span> {(statusRes.data as any).osName} ({(statusRes.data as any).osVersion})</div>
              <div><span className="text-muted">Branch:</span> {(statusRes.data as any).branch}</div>
            </div>
          )}
        </div>

        <div className="glass-strong rounded-xl md:rounded-2xl p-3 md:p-4">
          <h2 className="text-base md:text-lg font-semibold text-text mb-2">Configured service</h2>
          {!radarrService ? (
            <div className="text-xs md:text-sm text-amber-100">No Radarr service configured. Add one on the Settings → Services tab.</div>
          ) : (
            <div className="text-xs md:text-sm text-muted space-y-1">
              <div>
                <span className="text-muted">Service:</span> {radarrService.name}
              </div>
              <div>
                <span className="text-muted">Root folder:</span> {displayValue(radarrService.config?.rootFolder)}
              </div>
              <div>
                <span className="text-muted">Quality profile:</span>{" "}
                {displayValue(radarrService.config?.qualityProfileId ?? radarrService.config?.qualityProfile)}
              </div>
              <div>
                <span className="text-muted">Minimum availability:</span>{" "}
                {displayValue(radarrService.config?.minimumAvailability, "released")}
              </div>
              {Array.isArray(radarrService.config?.tags) && radarrService.config.tags.length > 0 && (
                <div>
                  <span className="text-muted">Tags:</span> {(radarrService.config.tags as string[]).join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div id="library" className="grid gap-4 md:grid-cols-2">
        <div className="glass-strong rounded-xl md:rounded-2xl p-3 md:p-4">
          <h2 className="text-base md:text-lg font-semibold text-text mb-2">Library snapshot</h2>
          {!moviesRes.ok ? (
            <div className="text-xs md:text-sm text-amber-700">Unable to load movies list: {moviesRes.error}</div>
          ) : (
            <div className="text-xs md:text-sm text-muted space-y-1">
              <div><span className="text-muted">Total movies:</span> {totalMovies}</div>
              <div><span className="text-muted">Monitored:</span> {monitoredMovies}</div>
              <div><span className="text-muted">Missing file:</span> {missingMovies}</div>
            </div>
          )}
        </div>

        <div className="glass-strong rounded-xl md:rounded-2xl p-3 md:p-4">
          <h2 className="text-base md:text-lg font-semibold text-text mb-2">Recently added movies</h2>
          {!moviesRes.ok ? (
            <div className="text-xs md:text-sm text-amber-700">Unable to load movies list: {moviesRes.error}</div>
          ) : (
            <div className="overflow-x-auto -mx-3 md:mx-0">
              <table className="w-full text-xs md:text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="p-2 md:p-4">Title</th>
                    <th className="p-2 md:p-4">Year</th>
                    <th className="p-2 md:p-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMovies.map(m => (
                    <tr key={m.id} className="border-t border-border">
                      <td className="p-2 md:p-4 font-semibold text-text text-xs md:text-sm">{m.title}</td>
                      <td className="p-2 md:p-4 text-muted">{m.year ?? "—"}</td>
                      <td className="p-2 md:p-4"><span className={`rounded-full px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs font-semibold ${m.hasFile ? 'bg-green-500' : 'bg-red-500'} text-white`}>{m.hasFile ? "Downloaded" : "Missing"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div id="queue">
        <div className="glass-strong rounded-xl md:rounded-2xl p-3 md:p-4">
          <h2 className="text-base md:text-lg font-semibold text-text mb-2">Queue (downloads)</h2>
          {!queueRes.ok ? (
            <div className="text-xs md:text-sm text-amber-700">Unable to load queue: {queueRes.error}</div>
          ) : queueRecords.length === 0 ? (
            <div className="text-xs md:text-sm text-muted">Queue is empty.</div>
          ) : (
            <div className="overflow-x-auto -mx-3 md:mx-0">
              <table className="w-full text-xs md:text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="p-2 md:p-4">Movie</th>
                    <th className="p-2 md:p-4">Status</th>
                    <th className="p-2 md:p-4 hidden sm:table-cell">Time left</th>
                    <th className="p-2 md:p-4">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {queueRecords.map(q => (
                    <tr key={q.id} className="border-t border-border">
                      <td className="p-2 md:p-4 font-semibold text-text text-xs md:text-sm">{q?.movie?.title ?? q?.title ?? "—"}</td>
                      <td className="p-2 md:p-4"><span className="rounded-full px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs font-semibold bg-primary text-white">{q?.status ?? q?.trackedDownloadStatus ?? "—"}</span></td>
                      <td className="p-2 md:p-4 text-muted hidden sm:table-cell">{q?.timeleft ?? "—"}</td>
                      <td className="p-2 md:p-4 text-muted">
                        {typeof q?.size === "number" && typeof q?.sizeleft === "number"
                          ? `${Math.max(0, Math.round(((q.size - q.sizeleft) / q.size) * 100))}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div id="logs">
        <div className="glass-strong rounded-xl md:rounded-2xl p-3 md:p-4">
          <h2 className="text-base md:text-lg font-semibold text-text mb-2">Recent logs</h2>
          {!logsRes.ok ? (
            <div className="text-xs md:text-sm text-amber-700">Unable to load logs: {logsRes.error}</div>
          ) : (
            <div className="overflow-x-auto -mx-3 md:mx-0">
              <table className="w-full text-xs md:text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="p-2 md:p-4">Time</th>
                    <th className="p-2 md:p-4">Level</th>
                    <th className="p-2 md:p-4">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logRecords.map(l => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="p-2 md:p-4 text-muted text-[10px] md:text-sm whitespace-nowrap">{formatDate(l.time)}</td>
                      <td className="p-2 md:p-4"><span className="rounded-full px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs font-semibold" style={{ backgroundColor: l.level === 'error' ? '#ef4444' : l.level === 'warn' ? '#f59e0b' : '#3b82f6', color: 'white' }}>{l.level}</span></td>
                      <td className="p-2 md:p-4 text-muted text-xs md:text-sm">{l.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
