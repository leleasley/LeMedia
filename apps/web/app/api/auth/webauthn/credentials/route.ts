import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { listUserCredentials, getUserWithHash } from "@/db";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const credentials = await listUserCredentials(dbUser.id);
    return NextResponse.json(credentials.map(c => ({
      id: c.id,
      name: c.name,
      deviceType: c.deviceType,
      created_at: c.created_at,
    })));
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
