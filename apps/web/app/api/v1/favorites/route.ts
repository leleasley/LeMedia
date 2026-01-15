import { NextRequest } from "next/server";
import { handleMediaListDelete, handleMediaListGet, handleMediaListPost } from "../../media-list/route";

export async function GET(req: NextRequest) {
  return handleMediaListGet(req, "favorite");
}

export async function POST(req: NextRequest) {
  return handleMediaListPost(req, "favorite");
}

export async function DELETE(req: NextRequest) {
  return handleMediaListDelete(req, "favorite");
}
