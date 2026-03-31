const BLOCKED_LANGUAGE_PATTERNS = [
  /\bf+u+c+k+\b/i,
  /\bs+h+i+t+\b/i,
  /\bb+i+t+c+h+\b/i,
  /\ba+s+s+h+o+l+e+\b/i,
  /\bd+a+m+n+\b/i,
  /\bb+a+s+t+a+r+d+\b/i,
  /\bc+u+n+t+\b/i,
  /\bn+[i1!|]+g+[e3]+r+\b/i,
  /\bf+a+g+(g+o+t+)?\b/i,
  /\bk+i+k+e+\b/i,
  /\bs+p+i+c+\b/i,
  /\bc+h+i+n+k+\b/i,
  /\bp+a+k+i+\b/i,
  /\br+e+t+a+r+d+(e+d)?\b/i,
];

export function containsBlockedWatchPartyLanguage(message: string) {
  const normalized = message
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s!|]/gu, " ");

  return BLOCKED_LANGUAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}
