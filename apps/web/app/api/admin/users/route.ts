import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getPool } from "@/db";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
    try {
        const user = await getUser();
        if (!user?.isAdmin) {
            return jsonResponseWithETag(request, { error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const pageRaw = Number(searchParams.get("page") ?? 1);
        const limitRaw = Number(searchParams.get("limit") ?? 10);
        const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 10;
        const sort = searchParams.get("sort") || "displayname";
        const search = searchParams.get("search") || "";

        const offset = (page - 1) * limit;

        // Build sort clause
        let orderBy = "u.username ASC";
        if (sort === "created") {
            orderBy = "u.created_at DESC";
        } else if (sort === "requests") {
            orderBy = "request_count DESC";
        }

        const db = getPool();

        // Build Where Clause
        const whereConditions: string[] = [];
        const queryParams: any[] = [];

        if (search) {
            queryParams.push(`%${search}%`);
            whereConditions.push(`(u.username ILIKE $${queryParams.length} OR u.email ILIKE $${queryParams.length})`);
        }

        const whereSQL = whereConditions.length > 0 ? `WHERE ${whereConditions.join(" AND ")}` : "";

        // Add Limit and Offset to params
        queryParams.push(limit);
        const limitParamIndex = queryParams.length;
        queryParams.push(offset);
        const offsetParamIndex = queryParams.length;

        // Get users with request count
        const users = await db.query(
            `SELECT 
        u.id,
        u.username,
        u.email,
        u.groups,
        u.created_at,
        u.discord_user_id,
        u.jellyfin_user_id,
        u.jellyfin_username,
        u.avatar_url,
        u.banned,
        u.weekly_digest_opt_in,
        COUNT(DISTINCT mr.id) as request_count
      FROM app_user u
      LEFT JOIN media_request mr ON mr.requested_by = u.id
      ${whereSQL}
      GROUP BY u.id, u.username, u.email, u.groups, u.created_at, u.jellyfin_user_id, u.jellyfin_username, u.avatar_url, u.banned, u.weekly_digest_opt_in
      ORDER BY ${orderBy}
      LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
            queryParams
        );

        // Get total count
        // We need to use the same params (minus limit/offset) for the count query
        const countParams = queryParams.slice(0, limitParamIndex - 1);
        const totalResult = await db.query(`SELECT COUNT(*) as count FROM app_user u ${whereSQL}`, countParams);
        const total = parseInt(totalResult.rows[0].count);

        return jsonResponseWithETag(request, {
            results: users.rows.map(row => ({
                id: row.id,
                email: row.email,
                displayName: row.username,
                isAdmin: row.groups?.toLowerCase().includes('admins') || row.groups?.toLowerCase().includes('admin') || false,
                banned: !!row.banned,
                weeklyDigestOptIn: !!row.weekly_digest_opt_in,
                createdAt: row.created_at,
                discordUserId: row.discord_user_id ?? null,
                jellyfinUserId: row.jellyfin_user_id,
                jellyfinUsername: row.jellyfin_username,
                avatarUrl: row.avatar_url || (row.jellyfin_user_id ? `/avatarproxy/${row.jellyfin_user_id}` : null),
                requestCount: parseInt(row.request_count) || 0,
            })),
            pageInfo: {
                page,
                pages: Math.ceil(total / limit),
                results: users.rows.length,
                total,
            },
        });
    } catch (error) {
        logger.error("Error fetching users:", error);
        return jsonResponseWithETag(request, 
            { error: "Failed to fetch users" },
            { status: 500 }
        );
    }
}
