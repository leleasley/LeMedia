import { NextRequest, NextResponse } from "next/server";
import { getNetwork, getTvByNetwork } from "@/lib/tmdb";
import { enforceTmdbRateLimit, parsePage } from "../../../../_shared";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ networkId: string }> }
) {
    try {
        const rateLimit = enforceTmdbRateLimit(req);
        if (rateLimit) return rateLimit;
        const { networkId } = await params;
        const page = parsePage(req);

        // Fetch network details and TV shows in parallel
        const [network, discoverData] = await Promise.all([
            getNetwork(parseInt(networkId)),
            getTvByNetwork(parseInt(networkId), page)
        ]);

        return jsonResponseWithETag(req, {
            network: {
                id: network.id,
                name: network.name,
                logoPath: network.logo_path,
                originCountry: network.origin_country,
                headquarters: network.headquarters,
                homepage: network.homepage,
            },
            results: discoverData.results,
            page: discoverData.page,
            totalPages: discoverData.total_pages,
            totalResults: discoverData.total_results,
        });
    } catch (err) {
        logger.error("Error in network API:", err);
        return jsonResponseWithETag(req, 
            { error: "Failed to fetch network data", details: err instanceof Error ? err.message : String(err) },
            { status: 500 }
        );
    }
}
