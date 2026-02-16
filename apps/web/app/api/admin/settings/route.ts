import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getSetting, getSettingInt, setSetting } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;

    const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
    const defaultImageProxy = process.env.IMAGE_PROXY_ENABLED
        ? process.env.IMAGE_PROXY_ENABLED !== "false"
        : true;
    const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
    const rawImageProxy = await getSetting("image_proxy_enabled");
    const imageProxyEnabled =
        rawImageProxy === null
            ? defaultImageProxy
            : rawImageProxy !== "false" && rawImageProxy !== "0";

    const rawOtpEnabled = await getSetting("auth.otp_enabled");
    const otpEnabled = rawOtpEnabled === null || rawOtpEnabled === "1" || rawOtpEnabled === "true";

    const rawSsoEnabled = await getSetting("auth.sso_enabled");
    const ssoEnabled = rawSsoEnabled === null || rawSsoEnabled === "1" || rawSsoEnabled === "true";

    const rawMfaAdmin = await getSetting("auth.enforce_mfa_admin");
    const enforceMfaAdmin = rawMfaAdmin === "1" || rawMfaAdmin === "true";

    const rawMfaAll = await getSetting("auth.enforce_mfa_all");
    const enforceMfaAll = rawMfaAll === "1" || rawMfaAll === "true";

    const rawSidebarFooter = await getSetting("sidebar_footer_text");
    const rawJobTimezone = await getSetting("jobs.timezone");
    const envJobTimezone = process.env.JOBS_TIMEZONE || process.env.TZ || "";
    const jobTimezone = (rawJobTimezone ?? "").trim() || envJobTimezone.trim();

    return jsonResponseWithETag(req, {
        session_max_age: sessionMaxAge,
        image_proxy_enabled: imageProxyEnabled,
        otp_enabled: otpEnabled,
        sso_enabled: ssoEnabled,
        enforce_mfa_admin: enforceMfaAdmin,
        enforce_mfa_all: enforceMfaAll,
        sidebar_footer_text: rawSidebarFooter,
        job_timezone: jobTimezone
    });
}

export async function PUT(req: NextRequest) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json().catch(() => ({}));
    const sessionRaw = body?.session_max_age;
    const hasSession = sessionRaw !== undefined;
    const imageProxyEnabled = body?.image_proxy_enabled;
    const hasImageProxy = imageProxyEnabled !== undefined;
    const otpEnabled = body?.otp_enabled;
    const hasOtp = otpEnabled !== undefined;
    const ssoEnabled = body?.sso_enabled;
    const hasSso = ssoEnabled !== undefined;
    const enforceMfaAdmin = body?.enforce_mfa_admin;
    const hasMfaAdmin = enforceMfaAdmin !== undefined;
    const enforceMfaAll = body?.enforce_mfa_all;
    const hasMfaAll = enforceMfaAll !== undefined;
    const sidebarFooter = body?.sidebar_footer_text;
    const hasSidebarFooter = sidebarFooter !== undefined;
    const jobTimezone = body?.job_timezone;
    const hasJobTimezone = jobTimezone !== undefined;

    const changedFields: string[] = [];

    if (!hasSession && !hasImageProxy && !hasOtp && !hasSso && !hasMfaAdmin && !hasMfaAll && !hasSidebarFooter && !hasJobTimezone) {
        return NextResponse.json({ error: "No settings provided" }, { status: 400 });
    }

    if (hasJobTimezone) {
        if (typeof jobTimezone !== "string") {
            return NextResponse.json({ error: "Invalid job_timezone" }, { status: 400 });
        }
        const normalized = jobTimezone.trim();
        if (normalized) {
            try {
                new Intl.DateTimeFormat("en-GB", { timeZone: normalized }).format(new Date());
            } catch {
                return NextResponse.json({ error: "Invalid job_timezone" }, { status: 400 });
            }
            await setSetting("jobs.timezone", normalized);
            process.env.JOBS_TIMEZONE = normalized;
        } else {
            await setSetting("jobs.timezone", "");
            if (process.env.JOBS_TIMEZONE) delete process.env.JOBS_TIMEZONE;
        }
        changedFields.push("jobs.timezone");
    }

    if (hasSession) {
        const v = Number(sessionRaw);
        if (!Number.isFinite(v) || v <= 0) {
            return NextResponse.json({ error: "Invalid session_max_age" }, { status: 400 });
        }
        await setSetting("session_max_age", String(Math.floor(v)));
        changedFields.push("session_max_age");
    }

    if (hasImageProxy) {
        if (typeof imageProxyEnabled !== "boolean") {
            return NextResponse.json({ error: "Invalid image_proxy_enabled" }, { status: 400 });
        }
        await setSetting("image_proxy_enabled", imageProxyEnabled ? "1" : "0");
        changedFields.push("image_proxy_enabled");
    }

    if (hasOtp) {
        if (typeof otpEnabled !== "boolean") {
            return NextResponse.json({ error: "Invalid otp_enabled" }, { status: 400 });
        }
        await setSetting("auth.otp_enabled", otpEnabled ? "1" : "0");
        changedFields.push("auth.otp_enabled");
    }

    if (hasSso) {
        if (typeof ssoEnabled !== "boolean") {
            return NextResponse.json({ error: "Invalid sso_enabled" }, { status: 400 });
        }
        await setSetting("auth.sso_enabled", ssoEnabled ? "1" : "0");
        changedFields.push("auth.sso_enabled");
    }

    if (hasMfaAdmin) {
        if (typeof enforceMfaAdmin !== "boolean") {
            return NextResponse.json({ error: "Invalid enforce_mfa_admin" }, { status: 400 });
        }
        await setSetting("auth.enforce_mfa_admin", enforceMfaAdmin ? "1" : "0");
        changedFields.push("auth.enforce_mfa_admin");
    }

    if (hasMfaAll) {
        if (typeof enforceMfaAll !== "boolean") {
            return NextResponse.json({ error: "Invalid enforce_mfa_all" }, { status: 400 });
        }
        await setSetting("auth.enforce_mfa_all", enforceMfaAll ? "1" : "0");
        changedFields.push("auth.enforce_mfa_all");
    }

    if (hasSidebarFooter) {
        await setSetting("sidebar_footer_text", String(sidebarFooter));
        changedFields.push("sidebar_footer_text");
    }

    if (changedFields.length) {
        await logAuditEvent({
            action: "admin.settings_changed",
            actor: user.username,
            metadata: { fields: changedFields },
            ip: getClientIp(req),
        });
    }

    return NextResponse.json({ ok: true });
}
