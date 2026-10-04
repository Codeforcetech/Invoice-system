import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 外部の提出リンクのトークン。
 * - 32バイトの暗号論的乱数（推測できない）。
 * - データベースには、ハッシュ（SHA-256）だけを保存する。元のトークンは、発行時に1回だけ見せる。
 */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const generateToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export const LINK_DAYS = [7, 30, 90] as const;
export const DEFAULT_LINK = {
  days: 30,
  maxPending: 3,
  maxSubmissions: 20,
  aiReadsLimit: 5,
};

/**
 * 有効なリンクを探す。形式が違う・存在しない・取り消し済み・期限切れは、すべて null
 * （どれなのかは、呼び出し側にも相手にも区別させない）。
 */
export async function findActiveLink(db: Db, token: unknown, now = new Date()) {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  const link = await db.submissionLink.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!link || link.revokedAt || link.expiresAt <= now) return null;
  return link;
}

export type LinkStatus = "ACTIVE" | "EXPIRED" | "REVOKED";
export const linkStatus = (
  l: { revokedAt: Date | null; expiresAt: Date },
  now = new Date(),
): LinkStatus =>
  l.revokedAt ? "REVOKED" : l.expiresAt <= now ? "EXPIRED" : "ACTIVE";

/**
 * ログインなしの入口の、大量アクセスを止める数え上げ（データベースで数えるので、サーバーが複数でも効く）。
 * 窓の中の回数が上限に達したら false。
 */
export async function throttle(
  db: Db,
  scope: string,
  who: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<boolean> {
  const key = createHash("sha256").update(`${scope}:${who}`).digest("hex");
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "PublicThrottle" ("key", "windowStart", "count")
    VALUES (${key}, ${now}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "PublicThrottle"."windowStart" <= ${new Date(+now - windowMs)} THEN 1 ELSE "PublicThrottle"."count" + 1 END,
      "windowStart" = CASE WHEN "PublicThrottle"."windowStart" <= ${new Date(+now - windowMs)} THEN ${now} ELSE "PublicThrottle"."windowStart" END
    RETURNING "count"`;
  // 偽装した送り元で、制限用の表が増え続けないように、ときどき古い行を消す。
  if (Math.random() < 0.02) await purgeThrottle(db).catch(() => {});
  return (rows[0]?.count ?? 1) <= limit;
}

/** 古い数え上げの行を消す（時々呼ぶ）。 */
export async function purgeThrottle(db: Db, olderThanMs = 24 * 3600_000) {
  await db.publicThrottle.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - olderThanMs) } },
  });
}

/**
 * リクエストの送り元（プロキシが付けるヘッダーの先頭）。
 * ヘッダーがないときは null を返す（「不明」を1つの枠にまとめると、1人が枠を使い切るだけで、全員が止まってしまうため。
 * その場合は、送り元ごとの制限は行わず、リンクごと・全体の制限だけで守る）。
 */
export function clientAddress(h: Headers): string | null {
  const f = (
    h.get("x-forwarded-for")?.split(",")[0] ??
    h.get("x-real-ip") ??
    ""
  ).trim();
  return f ? f.slice(0, 64) : null;
}

/** 回数を増やさずに、いま上限に達しているかだけを確認する。 */
export async function throttleBlocked(
  db: Db,
  scope: string,
  who: string,
  limit: number,
  windowMs: number,
  now = new Date(),
): Promise<boolean> {
  const key = createHash("sha256").update(`${scope}:${who}`).digest("hex");
  const row = await db.publicThrottle.findUnique({ where: { key } });
  return !!row && +row.windowStart > +now - windowMs && row.count >= limit;
}

/** リンクの残り日数（今日を含めず、切り上げ）。 */
export const daysLeft = (expiresAt: Date, now = new Date()) =>
  Math.max(0, Math.ceil((+expiresAt - +now) / 86_400_000));
