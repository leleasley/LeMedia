import "server-only";

import { getSetting } from "@/db";

const DEFAULT_IMAGE_PROXY_ENABLED = process.env.IMAGE_PROXY_ENABLED
  ? process.env.IMAGE_PROXY_ENABLED !== "false"
  : true;

export async function getImageProxyEnabled(): Promise<boolean> {
  const raw = await getSetting("image_proxy_enabled");
  if (raw === null) return DEFAULT_IMAGE_PROXY_ENABLED;
  return raw !== "false" && raw !== "0";
}
