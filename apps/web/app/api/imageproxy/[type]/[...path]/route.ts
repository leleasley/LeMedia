import { NextRequest } from "next/server";
import { handleImageProxyRequest } from "@/lib/imageproxy-handler";

export async function GET(
  req: NextRequest,
  { params }: { params: { type: string; path: string[] } | Promise<{ type: string; path: string[] }> }
) {
  return handleImageProxyRequest(req, params);
}
