import { NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { getUserByUsername, upsertUser } from "@/db";
import {
  addCustomListCollaborator,
  getCustomListAccessForUser,
  listCustomListCollaborators,
  removeCustomListCollaborator,
  updateCustomListCollaboratorRole,
} from "@/db/lists";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { apiError, apiSuccess } from "@/lib/api-contract";

const AddCollaboratorSchema = z.object({
  username: z.string().min(1).max(100),
  role: z.enum(["editor", "viewer"]).default("editor"),
});

const UpdateCollaboratorSchema = z.object({
  collaboratorUserId: z.number().int().positive(),
  role: z.enum(["editor", "viewer"]),
});

const DeleteCollaboratorSchema = z.object({
  collaboratorUserId: z.number().int().positive(),
});

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) {
    throw new Error("Unauthorized");
  }
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const { listId } = await params;
    const listIdNum = Number(listId);

    if (!Number.isFinite(listIdNum) || listIdNum <= 0) {
      return apiError("Invalid list ID", { status: 400 });
    }

    const access = await getCustomListAccessForUser(listIdNum, userId);
    if (!access) {
      return apiError("List not found", { status: 404 });
    }

    const collaborators = await listCustomListCollaborators(listIdNum);
    return apiSuccess({ collaborators, access });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    return apiError("Unable to load collaborators", { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { listId } = await params;
    const listIdNum = Number(listId);
    if (!Number.isFinite(listIdNum) || listIdNum <= 0) {
      return apiError("Invalid list ID", { status: 400 });
    }

    const body = AddCollaboratorSchema.parse(await req.json());
    const collaborator = await addCustomListCollaborator({
      listId: listIdNum,
      ownerUserId: userId,
      collaboratorUsername: body.username,
      role: body.role,
    });

    return apiSuccess({ collaborator }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    if (error instanceof Error && error.message === "Owner privileges required") {
      return apiError("Only the owner can manage collaborators", { status: 403 });
    }
    if (error instanceof Error && error.message === "Collaborator not found") {
      return apiError("Collaborator not found", { status: 404 });
    }
    if (error instanceof Error && error.message === "Owner cannot be a collaborator") {
      return apiError("Owner cannot be a collaborator", { status: 400 });
    }
    if (error instanceof z.ZodError) {
      logger.warn("[lists/collaborators POST] Invalid payload", { issues: error.issues });
      return apiError("Invalid request", { status: 400 });
    }
    return apiError("Unable to add collaborator", { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { listId } = await params;
    const listIdNum = Number(listId);
    if (!Number.isFinite(listIdNum) || listIdNum <= 0) {
      return apiError("Invalid list ID", { status: 400 });
    }

    const body = UpdateCollaboratorSchema.parse(await req.json());
    const collaborator = await updateCustomListCollaboratorRole({
      listId: listIdNum,
      ownerUserId: userId,
      collaboratorUserId: body.collaboratorUserId,
      role: body.role,
    });
    if (!collaborator) {
      return apiError("Collaborator not found", { status: 404 });
    }

    return apiSuccess({ collaborator });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    if (error instanceof Error && error.message === "Owner privileges required") {
      return apiError("Only the owner can manage collaborators", { status: 403 });
    }
    if (error instanceof z.ZodError) {
      logger.warn("[lists/collaborators PATCH] Invalid payload", { issues: error.issues });
      return apiError("Invalid request", { status: 400 });
    }
    return apiError("Unable to update collaborator", { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { listId } = await params;
    const listIdNum = Number(listId);
    if (!Number.isFinite(listIdNum) || listIdNum <= 0) {
      return apiError("Invalid list ID", { status: 400 });
    }

    const body = DeleteCollaboratorSchema.parse(await req.json());
    const removed = await removeCustomListCollaborator({
      listId: listIdNum,
      ownerUserId: userId,
      collaboratorUserId: body.collaboratorUserId,
    });
    if (!removed) {
      return apiError("Collaborator not found", { status: 404 });
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    if (error instanceof Error && error.message === "Owner privileges required") {
      return apiError("Only the owner can manage collaborators", { status: 403 });
    }
    if (error instanceof z.ZodError) {
      logger.warn("[lists/collaborators DELETE] Invalid payload", { issues: error.issues });
      return apiError("Invalid request", { status: 400 });
    }
    return apiError("Unable to remove collaborator", { status: 500 });
  }
}