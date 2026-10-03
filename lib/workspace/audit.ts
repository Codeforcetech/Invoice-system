import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export const auditEntityLabel: Record<string, string> = {
  MEMBER: "メンバー",
  JOURNAL: "仕訳",
  INVOICE: "請求書",
  PAYMENT: "支払管理",
  RECEIPT: "入金消込",
  CLAIM: "経費精算",
  ASSET: "固定資産",
  ACCOUNT: "勘定科目",
  SETTING: "設定",
  STATEMENT: "明細取込",
  REPORT: "レポート",
  EXPORT: "出力",
  SESSION: "ログイン",
  USER: "ユーザー",
  TEMPLATE: "テンプレート",
  MAIL: "メール",
  EVIDENCE: "証憑",
};

/**
 * Append one audit row. Call inside the same transaction as the change so that a
 * rolled-back change never leaves a log entry and a committed one always does.
 * Keep `summary` free of amounts-in-bulk, file contents and personal data.
 */
export async function recordAudit(
  db: Db,
  who: { ownerId: string; userId: string },
  event: {
    action: string;
    entity: string;
    entityId?: string | null;
    summary: string;
  },
) {
  return db.auditLog.create({
    data: {
      ownerId: who.ownerId,
      actorId: who.userId,
      action: event.action.slice(0, 60),
      entity: event.entity.slice(0, 40),
      entityId: event.entityId?.slice(0, 100) ?? null,
      summary: event.summary.slice(0, 300),
    },
  });
}

/**
 * For events with no business transaction to join (sign-in, sign-out, failed sign-in).
 * A logging failure must not lock people out, so it is reported to the server log only.
 */
export async function recordAuditSafely(
  db: Db,
  who: { ownerId: string; userId: string },
  event: Parameters<typeof recordAudit>[2],
) {
  try {
    await recordAudit(db, who, event);
  } catch (e) {
    console.error("audit log write failed", e instanceof Error ? e.message : e);
  }
}
