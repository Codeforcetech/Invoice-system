import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import {
  buildSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { dummyPasswordHash, verifyPassword } from "@/lib/auth/password";
import {
  clearLoginFailures,
  lockedSeconds,
  recordLoginFailure,
} from "@/lib/auth/throttle";
import { resolveWorkspace } from "@/lib/workspace/access";
import { recordAuditSafely } from "@/lib/workspace/audit";

/** HTMLフォーム POST 後は 303 にし、追従リクエストを GET にする（307 だと POST /login で 405 になる） */
function redirectAfterForm(url: URL) {
  // Stay on the submitted origin (localhost and 127.0.0.1 use different cookies).
  return new NextResponse(null, {
    status: 303,
    headers: { Location: url.pathname + url.search },
  });
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  // A locked address is refused before anything else, whether or not the account exists.
  if (await lockedSeconds(prisma, email)) {
    return redirectAfterForm(new URL("/login?error=locked", req.url));
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, role: true },
  });
  // Unknown addresses take as long as wrong passwords, so timing does not reveal accounts.
  const ok = await verifyPassword({
    password,
    passwordHash: user?.passwordHash ?? (await dummyPasswordHash()),
  });
  if (!user || !ok) {
    const locked = await recordLoginFailure(prisma, email);
    // Only accounts that exist can be logged; the page never reveals which case failed.
    if (user) {
      const ws = await resolveWorkspace(prisma, user.id);
      await recordAuditSafely(prisma, ws, {
        action: locked ? "LOGIN_LOCKED" : "LOGIN_FAILED",
        entity: "SESSION",
        summary: locked
          ? "ログインに連続して失敗したため、15分間ロック"
          : "ログインに失敗（パスワード不一致）",
      });
    }
    return redirectAfterForm(
      new URL(locked ? "/login?error=locked" : "/login?error=invalid", req.url),
    );
  }
  await clearLoginFailures(prisma, email);
  const ws = await resolveWorkspace(prisma, user.id);
  await recordAuditSafely(prisma, ws, {
    action: "LOGIN",
    entity: "SESSION",
    summary: "ログイン",
  });

  const token = await buildSessionToken({ userId: user.id, role: user.role });
  const res = redirectAfterForm(new URL("/dashboard", req.url));
  res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return res;
}
