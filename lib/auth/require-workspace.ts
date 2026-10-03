import "server-only";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import {
  PermissionError,
  assertRole,
  resolveWorkspace,
  type WorkspaceRole,
} from "@/lib/workspace/access";

/**
 * For server actions and route handlers. Resolves the acting user's workspace and
 * throws a PermissionError when their role is below `minimum`.
 * Use `ownerId` (not `user.id`) for every ownership column.
 */
export async function requireWorkspace(minimum: WorkspaceRole = "VIEWER") {
  const user = await requireUser();
  const ctx = await resolveWorkspace(prisma, user.id);
  assertRole(ctx, minimum);
  return { user, ...ctx };
}

/** For pages: send users who lack the role back to the dashboard instead of erroring. */
export async function requireWorkspacePage(minimum: WorkspaceRole = "VIEWER") {
  try {
    return await requireWorkspace(minimum);
  } catch (e) {
    if (e instanceof PermissionError) redirect("/dashboard");
    throw e;
  }
}
