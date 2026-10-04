import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

/**
 * ログイン中のユーザーを取得する。同じ画面の表示の中で何度呼ばれても、データベースへの問い合わせは1回
 * （レイアウトとページの両方が呼ぶため）。リクエストをまたいでは、覚えない。
 */
const loadUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, role: true },
  });
});

export async function requireUser() {
  const user = await loadUser();
  if (!user) redirect("/login");
  return user;
}
