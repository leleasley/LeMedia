import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { getMediaShareById, incrementShareViewCountById } from "@/db";
import { getMovieWithCreditsAndVideos, getTvWithCreditsAndVideos, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { SharePageClient } from "./SharePageClient";
import type { Metadata } from "next";
import { isShareAccessValid } from "@/lib/share-auth";
import { SharePasswordGate } from "./SharePasswordGate";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const shareId = parseInt(id, 10);

  if (isNaN(shareId)) {
    return { title: "Invalid Share Link - LeMedia" };
  }

  const share = await getMediaShareById(shareId);
  
  if (!share) {
    return { title: "Share Not Found - LeMedia" };
  }

  // Check if expired
  if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
    return { title: "Link Expired - LeMedia" };
  }

  if (share.passwordHash) {
    return { title: "Protected Share - LeMedia", description: "Password required to view this share." };
  }

  try {
    let media: any;
    if (share.mediaType === "movie") {
      media = await getMovieWithCreditsAndVideos(share.tmdbId);
    } else {
      media = await getTvWithCreditsAndVideos(share.tmdbId);
    }

    const title = share.mediaType === "movie" ? media.title : media.name;
    const description = media.overview?.slice(0, 160) || `Watch ${title}`;

    return {
      title: `${title} - LeMedia`,
      description,
    };
  } catch (error) {
    return { title: "Share - LeMedia" };
  }
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shareId = parseInt(id, 10);

  if (isNaN(shareId)) {
    notFound();
  }

  const share = await getMediaShareById(shareId);

  if (!share) {
    notFound();
  }

  // Check if expired
  if (share.expiresAt) {
    const expiresAt = new Date(share.expiresAt);
    if (expiresAt < new Date()) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <div className="bg-slate-900 border border-red-500/20 rounded-2xl p-8">
              <div className="text-6xl mb-4">⏰</div>
              <h1 className="text-2xl font-bold text-white mb-2">Link Expired</h1>
              <p className="text-gray-400">This share link has expired and is no longer available.</p>
            </div>
          </div>
        </div>
      );
    }
  }

  if (share.maxViews && share.viewCount >= share.maxViews) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-8">
            <div className="text-6xl mb-4">🚫</div>
            <h1 className="text-2xl font-bold text-white mb-2">View Limit Reached</h1>
            <p className="text-gray-400">This share link has reached its maximum number of views.</p>
          </div>
        </div>
      </div>
    );
  }

  if (share.passwordHash) {
    const cookieStore = await cookies();
    const token = cookieStore.get(`lemedia_share_${shareId}`)?.value;
    if (!isShareAccessValid(shareId, share.passwordHash, token)) {
      return <SharePasswordGate shareId={shareId} />;
    }
  }

  // Fetch media details
  const imageProxyEnabled = await getImageProxyEnabled();
  let media: any;

  try {
    if (share.mediaType === "movie") {
      media = await getMovieWithCreditsAndVideos(share.tmdbId);
    } else {
      media = await getTvWithCreditsAndVideos(share.tmdbId);
    }
  } catch (error) {
    notFound();
  }

  const title = share.mediaType === "movie" ? media.title : media.name;
  const posterUrl = media.poster_path
    ? tmdbImageUrl(media.poster_path, "w500", imageProxyEnabled)
    : null;

  const backdropUrl = media.backdrop_path
    ? tmdbImageUrl(media.backdrop_path, "w1280", imageProxyEnabled)
    : null;

  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for") || "";
  const lastViewedIp = forwardedFor.split(",")[0]?.trim() || headerStore.get("x-real-ip");
  const lastViewedReferrer = headerStore.get("referer");
  const userAgent = headerStore.get("user-agent") || "";
  const lastViewedUaHash = userAgent
    ? crypto.createHash("sha256").update(userAgent).digest("hex").slice(0, 12)
    : null;
  const lastViewedCountry =
    headerStore.get("cf-ipcountry")
    || headerStore.get("x-geo-country")
    || headerStore.get("x-country");

  // Increment view count after validation
  await incrementShareViewCountById(shareId, {
    lastViewedIp: lastViewedIp || null,
    lastViewedReferrer: lastViewedReferrer || null,
    lastViewedCountry: lastViewedCountry || null,
    lastViewedUaHash,
  });

  return (
    <SharePageClient
      media={media}
      mediaType={share.mediaType}
      title={title}
      posterUrl={posterUrl}
      backdropUrl={backdropUrl}
      imageProxyEnabled={imageProxyEnabled}
    />
  );
}
