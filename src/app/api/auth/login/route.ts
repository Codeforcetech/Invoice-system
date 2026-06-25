import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { buildSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";

/** HTMLフォーム POST 後は 303 にし、追従リクエストを GET にする（307 だと POST /login で 405 になる） */
function redirectAfterForm(url: URL) {
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, role: true },
  });
  if (!user) {
    return redirectAfterForm(new URL("/login", req.url));
  }

  const ok = await verifyPassword({ password, passwordHash: user.passwordHash });
  if (!ok) {
    return redirectAfterForm(new URL("/login", req.url));
  }

  const token = await buildSessionToken({ userId: user.id, role: user.role });
  const res = redirectAfterForm(new URL("/dashboard", req.url));
  res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return res;
}
