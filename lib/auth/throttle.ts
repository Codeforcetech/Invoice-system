import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** 15分のうちに5回失敗すると、そのメールアドレスで15分間ログインできない。 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;

/** 大文字小文字・前後の空白の違いで回避されないよう、正規化してから保存用のキーにする。 */
export function throttleKey(email: string) {
  return createHash("sha256")
    .update(email.normalize("NFKC").trim().toLowerCase())
    .digest("hex");
}

/** ロック中なら、残りの秒数を返す。 */
export async function lockedSeconds(db: Db, email: string, now = new Date()) {
  const row = await db.loginThrottle.findUnique({
    where: { key: throttleKey(email) },
  });
  if (!row?.lockedUntil || row.lockedUntil <= now) return 0;
  return Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000);
}

/**
 * 失敗を1回数える。上限に達したらロックして true を返す。
 * 同時の試行で数え漏れしないよう、キーごとに直列化する。
 */
export async function recordLoginFailure(
  db: PrismaClient,
  email: string,
  now = new Date(),
) {
  const key = throttleKey(email);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"seiq-login:" + key}))`;
    const row = await tx.loginThrottle.findUnique({ where: { key } });
    const fresh =
      !row ||
      now.getTime() - row.firstFailedAt.getTime() > WINDOW_MS ||
      (row.lockedUntil && row.lockedUntil <= now);
    const failures = fresh ? 1 : row.failures + 1;
    const lock = failures >= MAX_FAILURES;
    const data = {
      failures: lock ? 0 : failures,
      firstFailedAt: fresh ? now : row!.firstFailedAt,
      lockedUntil: lock ? new Date(now.getTime() + LOCK_MS) : null,
    };
    await tx.loginThrottle.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
    return lock;
  });
}

export async function clearLoginFailures(db: Db, email: string) {
  await db.loginThrottle.deleteMany({ where: { key: throttleKey(email) } });
}
