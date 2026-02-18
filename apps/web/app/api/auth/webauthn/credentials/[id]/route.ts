import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { deleteUserCredential, getUserWithHash, updateUserCredentialName } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { verifyMfaCode } from "@/lib/mfa-reauth";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const resolvedParams = await Promise.resolve(params);
    const user = await getUser();
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode : "";
    const mfaCheck = verifyMfaCode(dbUser.mfa_secret, mfaCode);
    if (!mfaCheck.ok) {
      return NextResponse.json({ error: mfaCheck.message }, { status: 400 });
    }
    await deleteUserCredential(resolvedParams.id, dbUser.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  try {
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const resolvedParams = await Promise.resolve(params);
    const user = await getUser();
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json();
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    await updateUserCredentialName(resolvedParams.id, dbUser.id, name);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
