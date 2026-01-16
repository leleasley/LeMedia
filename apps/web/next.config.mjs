import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, "..", "..", ".env");

function loadRootEnv() {
  if (!fs.existsSync(rootEnvPath)) return;
  const contents = fs.readFileSync(rootEnvPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  poweredByHeader: false,
  compress: true, // Enable gzip compression
  productionBrowserSourceMaps: false, // Reduce payload
  env: {
    commitTag: process.env.COMMIT_TAG || "local",
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: "https", hostname: "image.tmdb.org" },
      { protocol: "https", hostname: "artworks.thetvdb.com" },
      { protocol: "https", hostname: "gravatar.com" },
      { protocol: "https", hostname: "plex.tv" }
    ],
    // Allow local image proxy paths
    domains: [],
    // Aggressive image optimization
    minimumCacheTTL: 31536000, // 1 year for immutable images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    scrollRestoration: true,
    largePageDataBytes: 256000,
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
  headers: async () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://image.tmdb.org https://artworks.thetvdb.com https://gravatar.com https://plex.tv",
      "font-src 'self' data:",
      "connect-src 'self' https://api.themoviedb.org https://www.omdbapi.com",
      "frame-src 'self' https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join("; ");

    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable"
          }
        ]
      },
      {
        source: "/((?!api|_next/static|_next/image|static|favicon.ico|manifest.json|icon-.*|apple-touch-icon.*|robots.txt|sitemap.xml).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, must-revalidate, max-age=0"
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff"
          },
          {
            key: "X-Frame-Options",
            value: "DENY"
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block"
          },
          {
            key: "Content-Security-Policy",
            value: csp
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin"
          },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), microphone=(), camera=()"
          }
        ]
      }
    ];
  },
};

export default nextConfig;
