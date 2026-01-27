export type DeviceInfo = {
  device: string;
  os: string;
  browser: string;
  browserVersion: string;
};

function pick(match: RegExpMatchArray | null, index = 1) {
  return match?.[index] ?? "";
}

function normalizeVersion(value: string) {
  if (!value) return "";
  return value.replace(/_/g, ".");
}

export function parseUserAgent(userAgent: string | null | undefined): DeviceInfo {
  const ua = String(userAgent || "");
  const lower = ua.toLowerCase();

  let device = "Unknown device";
  if (lower.includes("iphone")) device = "iPhone";
  else if (lower.includes("ipad")) device = "iPad";
  else if (lower.includes("android")) device = lower.includes("mobile") ? "Android phone" : "Android tablet";
  else if (lower.includes("cros")) device = "Chromebook";
  else if (lower.includes("windows")) device = "Windows PC";
  else if (lower.includes("mac os x")) device = "Mac";
  else if (lower.includes("linux")) device = "Linux PC";

  let os = "Unknown OS";
  if (lower.includes("iphone") || lower.includes("ipad")) {
    os = `iOS ${normalizeVersion(pick(ua.match(/OS ([\\d_]+)/i)))}`.trim();
  } else if (lower.includes("android")) {
    os = `Android ${pick(ua.match(/Android\\s([\\d.]+)/i))}`.trim();
  } else if (lower.includes("windows nt")) {
    const win = pick(ua.match(/Windows NT ([\\d.]+)/i));
    os = `Windows ${win}`.trim();
  } else if (lower.includes("mac os x")) {
    os = `macOS ${normalizeVersion(pick(ua.match(/Mac OS X ([\\d_]+)/i)))}`.trim();
  } else if (lower.includes("cros")) {
    os = "ChromeOS";
  } else if (lower.includes("linux")) {
    os = "Linux";
  }

  let browser = "Unknown";
  let browserVersion = "";
  if (lower.includes("edg/")) {
    browser = "Edge";
    browserVersion = pick(ua.match(/Edg\/([\d.]+)/));
  } else if (lower.includes("opr/") || lower.includes("opera")) {
    browser = "Opera";
    browserVersion = pick(ua.match(/OPR\/([\d.]+)/));
  } else if (lower.includes("chrome/") && !lower.includes("chromium") && !lower.includes("edg/")) {
    browser = "Chrome";
    browserVersion = pick(ua.match(/Chrome\/([\d.]+)/));
  } else if (lower.includes("firefox/")) {
    browser = "Firefox";
    browserVersion = pick(ua.match(/Firefox\/([\d.]+)/));
  } else if (lower.includes("safari/") && lower.includes("version/")) {
    browser = "Safari";
    browserVersion = pick(ua.match(/Version\/([\d.]+)/));
  }

  return { device, os, browser, browserVersion };
}

export function summarizeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  const info = parseUserAgent(userAgent);
  const parts = [
    info.device,
    info.os,
    info.browser + (info.browserVersion ? ` ${info.browserVersion}` : "")
  ].filter(Boolean);
  return parts.join(" • ");
}
