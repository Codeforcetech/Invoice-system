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
  const user = await requireUser();
  const ctx = await resolveWorkspace(prisma, user.id);
  try {
    assertRole(ctx, minimum);
  } catch (e) {
    // 提出者は、ダッシュボードも見られないので、提出の画面へ送る。
    if (e instanceof PermissionError)
      redirect(ctx.role === "SUBMITTER" ? "/submit" : "/dashboard");
    throw e;
  }
  return { user, ...ctx };
}

/** For pages used by submitters (contractors) and everyone above them. */
export const requireSubmitterPage = () => requireWorkspacePage("SUBMITTER");
