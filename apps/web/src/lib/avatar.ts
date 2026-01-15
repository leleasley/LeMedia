export type AvatarUser = {
  avatarUrl?: string | null;
  jellyfinUserId?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
};

const fallbackAvatarSvg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">',
  '<rect width="64" height="64" rx="32" fill="#1f2937"/>',
  '<circle cx="32" cy="26" r="12" fill="#9ca3af"/>',
  '<path d="M14 54c3-10 12-16 18-16s15 6 18 16" fill="#9ca3af"/>',
  '</svg>'
].join("");

const fallbackAvatarSrc = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackAvatarSvg)}`;
const avatarProxyPrefix = "/avatarproxy/";

export function getAvatarSrc(user?: AvatarUser | null) {
  if (user?.avatarUrl) return user.avatarUrl;
  if (user?.jellyfinUserId) return `${avatarProxyPrefix}${user.jellyfinUserId}`;
  return fallbackAvatarSrc;
}

export function getAvatarAlt(user?: AvatarUser | null, fallback = "User avatar") {
  return user?.displayName || user?.username || user?.email || fallback;
}

export function shouldBypassNextImage(src: string) {
  return src.startsWith(avatarProxyPrefix) || src.startsWith("data:image/");
}

export { fallbackAvatarSrc as DEFAULT_AVATAR_SRC };
