import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getMediaServiceSecretById } from "@/lib/service-config";
import { decryptSecret } from "@/lib/encryption";
import { createRadarrFetcher } from "@/lib/radarr";
import { createSonarrFetcher } from "@/lib/sonarr";
import { requireCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    let body: any = {};
    try {
        body = await req.json();
    } catch { }

    const serviceId = Number(body?.serviceId);
    if (!Number.isFinite(serviceId)) {
        return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
    }

    const service = await getMediaServiceSecretById(serviceId);
    if (!service) {
        return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    if (!service.enabled) {
        return NextResponse.json({ error: "Service is disabled" }, { status: 400 });
    }

    try {
        const apiKey = decryptSecret(service.api_key_encrypted);

        if (service.type === "radarr") {
            const fetcher = createRadarrFetcher(service.base_url, apiKey);
            await fetcher("/api/v3/command", {
                method: "POST",
                body: JSON.stringify({ name: "DownloadedMoviesImport" })
            });
        } else if (service.type === "sonarr") {
            const fetcher = createSonarrFetcher(service.base_url, apiKey);
            await fetcher("/api/v3/command", {
                method: "POST",
                body: JSON.stringify({ name: "DownloadedEpisodesScan" })
            });
        } else {
            return NextResponse.json({ error: "Unsupported service type" }, { status: 400 });
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Failed to trigger download retry", error);
        return NextResponse.json({ error: "Failed to trigger retry" }, { status: 500 });
    }
}
