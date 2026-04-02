import { getPool } from "./core";


// ============================================
// Request Analytics
// ============================================

export async function getRequestAnalytics(input: {
  startDate?: string;
  endDate?: string;
}): Promise<{
  totalRequests: number;
  movieRequests: number;
  tvRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  deniedRequests: number;
  avgApprovalTimeHours: number;
  topRequesters: Array<{ username: string; displayName: string | null; avatarUrl: string | null; jellyfinUserId: string | null; count: number }>;
  requestsByDay: Array<{ date: string; count: number }>;
  requestsByStatus: Array<{ status: string; count: number }>;
}> {
  const p = getPool();

  const dateFilter = input.startDate && input.endDate
    ? `WHERE mr.created_at >= $1 AND mr.created_at <= $2`
    : input.startDate
      ? `WHERE mr.created_at >= $1`
      : input.endDate
        ? `WHERE mr.created_at <= $1`
        : "";

  const params = input.startDate && input.endDate
    ? [input.startDate, input.endDate]
    : input.startDate || input.endDate
      ? [input.startDate || input.endDate]
      : [];

  // Overall stats
  const statsQuery = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN request_type = 'movie' THEN 1 END)::int AS movies,
      COUNT(CASE WHEN request_type = 'episode' THEN 1 END)::int AS tv,
      COUNT(CASE WHEN status IN ('pending', 'queued') THEN 1 END)::int AS pending,
      COUNT(CASE WHEN status IN ('submitted', 'available') THEN 1 END)::int AS approved,
      COUNT(CASE WHEN status = 'denied' THEN 1 END)::int AS denied
    FROM media_request mr
    ${dateFilter}
  `;
  const statsRes = await p.query(statsQuery, params);
  const stats = statsRes.rows[0];

  // Top requesters
  const topRequestersQuery = `
    SELECT u.username, u.display_name, u.avatar_url, u.jellyfin_user_id, COUNT(*)::int as count
    FROM media_request mr
    JOIN app_user u ON mr.requested_by = u.id
    ${dateFilter}
    GROUP BY u.id, u.username, u.display_name, u.avatar_url, u.jellyfin_user_id
    ORDER BY count DESC
    LIMIT 10
  `;
  const topRequestersRes = await p.query(topRequestersQuery, params);
  const topRequesters = topRequestersRes.rows.map(r => ({
    username: r.username as string,
    displayName: r.display_name as string | null,
    avatarUrl: r.avatar_url as string | null,
    jellyfinUserId: r.jellyfin_user_id as string | null,
    count: r.count as number,
  }));

  // Requests by day (last 30 days)
  const requestsByDayQuery = `
    SELECT DATE(mr.created_at) as date, COUNT(*)::int as count
    FROM media_request mr
    WHERE mr.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(mr.created_at)
    ORDER BY date ASC
  `;
  const requestsByDayRes = await p.query(requestsByDayQuery);
  const requestsByDay = requestsByDayRes.rows.map(r => ({
    date: r.date as string,
    count: r.count as number,
  }));

  // Requests by status
  const requestsByStatusQuery = `
    SELECT status, COUNT(*)::int as count
    FROM media_request mr
    ${dateFilter}
    GROUP BY status
    ORDER BY count DESC
  `;
  const requestsByStatusRes = await p.query(requestsByStatusQuery, params);
  const requestsByStatus = requestsByStatusRes.rows.map(r => ({
    status: r.status as string,
    count: r.count as number,
  }));

  // Average approval time (from pending to submitted/available)
  const avgTimeQuery = `
    SELECT EXTRACT(EPOCH FROM AVG(
      CASE
        WHEN status IN ('submitted', 'available') 
        THEN NOW() - created_at
        ELSE NULL
      END
    )) / 3600 as avg_hours
    FROM media_request mr
    ${dateFilter}
  `;
  const avgTimeRes = await p.query(avgTimeQuery, params);
  const avgApprovalTimeHours = parseFloat(avgTimeRes.rows[0]?.avg_hours ?? "0") || 0;

  return {
    totalRequests: stats.total,
    movieRequests: stats.movies,
    tvRequests: stats.tv,
    pendingRequests: stats.pending,
    approvedRequests: stats.approved,
    deniedRequests: stats.denied,
    avgApprovalTimeHours,
    topRequesters,
    requestsByDay,
    requestsByStatus,
  };
}
