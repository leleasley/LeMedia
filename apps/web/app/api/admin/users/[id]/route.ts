import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getPool, listUserOAuthAccounts } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { isAdminGroup, normalizeGroupList, serializeGroups } from "@/lib/groups";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await requireUser();
        if (currentUser instanceof NextResponse) return currentUser;
        const db = getPool();
        const { id } = await params;
        const userId = parseInt(id);
        const result = await db.query(
            `SELECT 
        id,
        username,
        display_name,
        email,
        groups,
        created_at,
        discord_user_id,
        letterboxd_username,
        trakt_username,
        jellyfin_user_id,
        jellyfin_username,
        avatar_url,
        banned
      FROM app_user
        WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return jsonResponseWithETag(request, { error: "User not found" }, { status: 404 });
        }

        const user = result.rows[0];
        const targetUsername = user.username ?? "";
        if (!currentUser?.isAdmin && currentUser?.username !== targetUsername) {
            return jsonResponseWithETag(request, { error: "Unauthorized" }, { status: 401 });
        }

        const oauthAccounts = await listUserOAuthAccounts(Number(user.id));
        const googleAccount = oauthAccounts.find((account) => account.provider === "google") ?? null;
        const githubAccount = oauthAccounts.find((account) => account.provider === "github") ?? null;

        return jsonResponseWithETag(request, {
            id: user.id,
            email: user.email,
            displayName: user.display_name || user.username,
            groups: normalizeGroupList(user.groups as string),
            isAdmin: isAdminGroup(user.groups as string),
            banned: !!user.banned,
            createdAt: user.created_at,
            discordUserId: user.discord_user_id ?? null,
            letterboxdUsername: user.letterboxd_username ?? null,
            traktUsername: user.trakt_username ?? null,
            jellyfinUserId: user.jellyfin_user_id,
            jellyfinUsername: user.jellyfin_username,
            googleLinked: Boolean(googleAccount),
            googleEmail: googleAccount?.providerEmail ?? null,
            githubLinked: Boolean(githubAccount),
            githubLogin: githubAccount?.providerLogin ?? null,
            avatarUrl: user.avatar_url || (user.jellyfin_user_id ? `/avatarproxy/${user.jellyfin_user_id}` : null),
        });
    } catch (error) {
        logger.error("Error fetching user", error);
        return jsonResponseWithETag(request, 
            { error: "Failed to fetch user" },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await requireUser();
        if (currentUser instanceof NextResponse) return currentUser;
        if (!currentUser.isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const db = getPool();
        const { id } = await params;
        const userId = parseInt(id);
        const body = await request.json();

        // Get current user ID for self-ban check
        const currentUserRes = await db.query("SELECT id FROM app_user WHERE username = $1", [currentUser.username]);
        const currentUserId = currentUserRes.rows[0]?.id;

        // Prepare update query parts
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (body.displayName !== undefined) {
            updates.push(`display_name = $${paramIndex++}`);
            const trimmed = String(body.displayName ?? "").trim();
            values.push(trimmed === "" ? null : trimmed);
        }

        if (body.email !== undefined) {
            updates.push(`email = $${paramIndex++}`);
            values.push(body.email);
        }

        if (body.groups !== undefined) {
            const normalized = normalizeGroupList(body.groups);
            updates.push(`groups = $${paramIndex++}`);
            values.push(serializeGroups(normalized));
        }

        if (body.discordUserId !== undefined) {
            const trimmed = String(body.discordUserId ?? "").trim();
            if (trimmed && !/^\d+$/.test(trimmed)) {
                return NextResponse.json({ error: "Discord User ID must be numeric" }, { status: 400 });
            }
            updates.push(`discord_user_id = $${paramIndex++}`);
            values.push(trimmed === "" ? null : trimmed);
        }

        if (body.letterboxdUsername !== undefined) {
            const trimmed = String(body.letterboxdUsername ?? "").trim();
            if (trimmed && !/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
                return NextResponse.json({ error: "Letterboxd username contains invalid characters" }, { status: 400 });
            }
            updates.push(`letterboxd_username = $${paramIndex++}`);
            values.push(trimmed === "" ? null : trimmed);
        }

        if (body.traktUsername !== undefined) {
            const trimmed = String(body.traktUsername ?? "").trim();
            if (trimmed && !/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
                return NextResponse.json({ error: "Trakt username contains invalid characters" }, { status: 400 });
            }
            updates.push(`trakt_username = $${paramIndex++}`);
            values.push(trimmed === "" ? null : trimmed);
        }

        if (body.banned !== undefined) {
            // Prevent banning self
            if (userId === currentUserId && body.banned === true) {
                 return NextResponse.json({ error: "Cannot ban your own account" }, { status: 400 });
            }
            // Prevent banning owner
            if (userId === 1 && body.banned === true) {
                 return NextResponse.json({ error: "Cannot ban owner account" }, { status: 403 });
            }
            updates.push(`banned = $${paramIndex++}`);
            values.push(!!body.banned);
        }

        if (updates.length === 0) {
            return NextResponse.json({ success: true });
        }

        values.push(userId);
        const targetRes = await db.query("SELECT username FROM app_user WHERE id = $1", [userId]);
        const targetUsername = targetRes.rows[0]?.username as string | undefined;
        await db.query(
            `UPDATE app_user SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
            values
        );

        const changedFields = updates.map(update => update.split("=")[0]?.trim()).filter(Boolean);
        await logAuditEvent({
            action: body.groups !== undefined ? "user.groups_changed" : "user.updated",
            actor: currentUser.username,
            target: targetUsername ?? String(userId),
            metadata: { fields: changedFields },
            ip: getClientIp(request),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error updating user", error);
        return NextResponse.json(
            { error: "Failed to update user" },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await requireUser();
        if (currentUser instanceof NextResponse) return currentUser;
        if (!currentUser.isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const db = getPool();
        const { id } = await params;
        const userId = parseInt(id);

        // Prevent deleting owner
        if (userId === 1) {
            return NextResponse.json(
                { error: "Cannot delete owner account" },
                { status: 403 }
            );
        }

        const targetRes = await db.query("SELECT username FROM app_user WHERE id = $1", [userId]);
        const targetUsername = targetRes.rows[0]?.username as string | undefined;

        await db.query("DELETE FROM app_user WHERE id = $1", [userId]);

        await logAuditEvent({
            action: "user.deleted",
            actor: currentUser.username,
            target: targetUsername ?? String(userId),
            ip: getClientIp(request),
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error deleting user", error);
        return NextResponse.json(
            { error: "Failed to delete user" },
            { status: 500 }
        );
    }
}
