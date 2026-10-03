import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { clearSession, getSession } from "@/lib/auth/session";
import { resolveWorkspace } from "@/lib/workspace/access";
import { recordAuditSafely } from "@/lib/workspace/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (session) {
    const ws = await resolveWorkspace(prisma, session.sub);
    await recordAuditSafely(prisma, ws, {
      action: "LOGOUT",
      entity: "SESSION",
      summary: "ログアウト",
    });
  }
  await clearSession();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
