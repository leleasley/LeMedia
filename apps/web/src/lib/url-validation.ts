/**
 * URL validation utilities to prevent SSRF attacks
 */

import { logger } from "@/lib/logger";
import { isIP } from "net";

/**
 * Private IP ranges that should be rejected to prevent SSRF
 */
const PRIVATE_IP_RANGES = [
  /^10\./,                    // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
  /^192\.168\./,              // 192.168.0.0/16
  /^127\./,                   // 127.0.0.0/8 (localhost)
  /^169\.254\./,              // 169.254.0.0/16 (link-local)
  /^0\./,                     // 0.0.0.0/8
  /^::1$/,                    // IPv6 localhost
  /^fe80:/i,                  // IPv6 link-local
  /^fc00:/i,                  // IPv6 unique local
  /^fd00:/i,                  // IPv6 unique local
];

/**
 * Hostnames that should always be rejected
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'metadata.google.internal', // GCP metadata service
  '169.254.169.254',          // AWS metadata service
];

export interface UrlValidationOptions {
  allowHttp?: boolean;
  allowPrivateIPs?: boolean;
  allowedCidrs?: string[];
  requireHttps?: boolean;
}

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrlValidationError';
  }
}

/**
 * Check if an IP address is in a private range
 */
function isPrivateIP(hostname: string): boolean {
  // Check against private IP patterns
  for (const pattern of PRIVATE_IP_RANGES) {
    if (pattern.test(hostname)) {
      return true;
    }
  }
  return false;
}

type IPv4Cidr = {
  base: number;
  mask: number;
};

function parseIPv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

function parseIPv4Cidr(cidr: string): IPv4Cidr | null {
  const [ipPart, maskPart] = cidr.split("/");
  if (!ipPart) return null;
  const base = parseIPv4(ipPart);
  if (base === null) return null;
  const prefix = maskPart === undefined ? 32 : Number(maskPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return { base, mask };
}

function isHostnameAllowedByCidrs(hostname: string, allowedCidrs: string[] | undefined): boolean {
  if (!allowedCidrs || allowedCidrs.length === 0) return false;
  if (isIP(hostname) !== 4) return false;
  const ipValue = parseIPv4(hostname);
  if (ipValue === null) return false;
  for (const rawCidr of allowedCidrs) {
    const cidr = rawCidr.trim();
    if (!cidr) continue;
    const parsed = parseIPv4Cidr(cidr);
    if (!parsed) continue;
    if ((ipValue & parsed.mask) === (parsed.base & parsed.mask)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if hostname is blocked
 */
function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return BLOCKED_HOSTNAMES.some(blocked => lower === blocked || lower.endsWith(`.${blocked}`));
}

/**
 * Validate a URL to prevent SSRF attacks
 *
 * @param urlString - The URL to validate
 * @param options - Validation options
 * @returns The validated URL object
 * @throws UrlValidationError if validation fails
 */
export function validateUrl(
  urlString: string,
  options: UrlValidationOptions = {}
): URL {
  const {
    allowHttp = process.env.NODE_ENV === 'development',
    allowPrivateIPs = process.env.NODE_ENV === 'development',
    allowedCidrs,
    requireHttps = process.env.NODE_ENV === 'production',
  } = options;

  // Parse URL
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (error) {
    throw new UrlValidationError(`Invalid URL format: ${urlString}`);
  }

  // Check protocol
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UrlValidationError(`Unsupported protocol: ${url.protocol}. Only HTTP(S) allowed.`);
  }

  // Enforce HTTPS in production if required
  if (requireHttps && url.protocol !== 'https:') {
    throw new UrlValidationError('HTTPS is required in production environment');
  }

  // Warn about HTTP in production
  if (process.env.NODE_ENV === 'production' && url.protocol === 'http:' && !allowHttp) {
    logger.warn('[Security] HTTP URL used in production - HTTPS recommended', {
      url: url.hostname,
    });
  }

  // Check for blocked hostnames
  if (isBlockedHostname(url.hostname)) {
    throw new UrlValidationError(`Blocked hostname: ${url.hostname}`);
  }

  // Check for private IPs (unless explicitly allowed)
  if (!allowPrivateIPs && isPrivateIP(url.hostname)) {
    if (isHostnameAllowedByCidrs(url.hostname, allowedCidrs)) {
      return url;
    }
    throw new UrlValidationError(
      `Private IP addresses are not allowed: ${url.hostname}`
    );
  }

  // Check for username/password in URL (security risk)
  if (url.username || url.password) {
    throw new UrlValidationError('URLs with embedded credentials are not allowed');
  }

  return url;
}

/**
 * Validate and normalize a base URL for external services
 *
 * @param baseUrl - The base URL to validate
 * @param serviceName - Name of the service (for logging)
 * @returns Normalized base URL string
 */
export function validateExternalServiceUrl(
  baseUrl: string | undefined | null,
  serviceName: string,
  options: UrlValidationOptions = {}
): string {
  if (!baseUrl) {
    throw new UrlValidationError(`${serviceName} base URL is required`);
  }

  const url = validateUrl(baseUrl, {
    requireHttps: process.env.NODE_ENV === 'production',
    ...options,
  });

  // Remove trailing slash for consistency
  let normalized = url.toString();
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  logger.debug(`[Security] Validated ${serviceName} URL`, {
    service: serviceName,
    hostname: url.hostname,
    protocol: url.protocol,
  });

  return normalized;
}
