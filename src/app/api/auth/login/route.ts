import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";

export async function POST(req: Request) {
  const formData = await req.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, role: true },
  });
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ok = await verifyPassword({ password, passwordHash: user.passwordHash });
  if (!ok) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  await createSession({ userId: user.id, role: user.role });
  return NextResponse.redirect(new URL("/invoices/new", req.url));
}

