"use server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { PermissionError, type WorkspaceRole } from "@/lib/workspace/access";
import { revalidatePath } from "next/cache";
import {
  accountingLock,
  reverseJournal,
  type Tx,
} from "@/lib/accounting/service";
import { dateText } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import {
  mappingSchema,
  normalizeDescription,
  parseStatements,
} from "@/lib/accounting/statement-csv";
import {
  ownedFeed,
  suggestions,
  statementFingerprint,
  postStatement,
  direction,
} from "@/lib/accounting/statements";

type Ws = Awaited<ReturnType<typeof requireWorkspace>>;
async function execute<T>(
  role: WorkspaceRole,
  fn: (tx: Tx, userId: string, ws: Ws) => Promise<T>,
) {
  try {
    const ws = await requireWorkspace(role);
    const data = await prisma.$transaction(
      async (tx) => {
        await accountingLock(tx, ws.ownerId);
        return fn(tx, ws.ownerId, ws);
      },
      { timeout: 30000 },
    );
    revalidatePath("/accounting", "layout");
    return { ok: true as const, data };
  } catch (e) {
    const error =
      e instanceof z.ZodError
        ? "入力内容を確認してください。"
        : e instanceof Error &&
            (e instanceof PermissionError ||
              (!("code" in e) && !e.message.includes("\n")))
          ? e.message
          : "保存できませんでした。再読み込みして確認してください。";
    return { ok: false as const, error };
  }
}
const importSchema = z.object({
  feedId: z.string().min(1),
  text: z.string().max(1_000_000),
  mapping: mappingSchema,
  fileName: z.string().trim().min(1).max(150),
  allowAutomatic: z.boolean().default(false),
});
async function prepare(tx: Tx, userId: string, raw: unknown) {
  const v = importSchema.parse(raw),
    { feed, setting } = await ownedFeed(tx, userId, v.feedId),
    parsed = parseStatements(v.text, v.mapping);
  if (
    parsed.some(
      (r) => r.date < dateText(setting.startDate) || r.date > japanToday(),
    )
  )
    throw new Error("明細の日付は会計開始日以降、今日以前にしてください。");
  if ((feed.kind === "CARD") !== (v.mapping.mode === "card"))
    throw new Error(
      "銀行は入出金別または符号付き、カードは利用額形式を選択してください。",
    );
  const firstImported = await tx.statementRow.findFirst({
    where: { userId, feedId: feed.id },
    select: { reference: true },
  });
  if (
    firstImported &&
    Boolean(firstImported.reference) !== v.mapping.reference >= 0
  )
    throw new Error(
      firstImported.reference
        ? "この口座は明細IDで重複判定しています。明細IDの列を指定してください。"
        : "この口座は明細IDなしで重複判定しています。明細IDは「指定しない」にしてください。",
    );
  const previous = await tx.statementRow.findMany({
    where: {
      userId,
      feedId: feed.id,
      fingerprint: { in: parsed.map(statementFingerprint) },
    },
  });
  const suggest = await suggestions(tx, userId, feed);
  const rows = parsed.map((r) => {
    const fingerprint = statementFingerprint(r),
      old = previous.find((p) => p.fingerprint === fingerprint);
    if (
      old &&
      (dateText(old.date) !== r.date ||
        old.amount !== r.amount ||
        normalizeDescription(old.description) !==
          normalizeDescription(r.description))
    )
      throw new Error(
        `${r.line}行目: 同じ明細IDの内容が以前の取込と異なります。元データを確認してください。`,
      );
    return {
      ...r,
      fingerprint,
      duplicate: !!old,
      suggestion: suggest(r.description, r.amount),
    };
  });
  return { v, feed, rows };
}
export async function createStatementFeed(raw: unknown) {
  return execute("ADMIN", async (tx, userId, ws) => {
    const v = z
      .object({
        name: z.string().trim().min(1).max(80),
        kind: z.enum(["BANK", "CARD"]),
        accountId: z.string().min(1),
      })
      .parse(raw);
    const setting = await tx.accountingSetting.findUnique({
      where: { userId },
    });
    if (!setting) throw new Error("先に会計を初期設定してください。");
    const account = await tx.account.findFirst({
      where: {
        id: v.accountId,
        userId,
        active: true,
        kind: v.kind === "BANK" ? "ASSET" : "LIABILITY",
      },
    });
    if (!account)
      throw new Error("銀行には資産、カードには負債の科目を指定してください。");
    const old = await tx.statementFeed.findUnique({
      where: { userId_name: { userId, name: v.name } },
    });
    if (old) {
      if (old.kind !== v.kind || old.accountId !== v.accountId)
        throw new Error("同じ口座名が登録済みです。");
      return old.id;
    }
    const feedRow = await tx.statementFeed.create({ data: { ...v, userId } });
    await recordAudit(tx, ws, { action: "FEED_CREATE", entity: "STATEMENT", entityId: feedRow.id, summary: `${v.kind === "BANK" ? "銀行口座" : "カード"}「${v.name}」を登録` });
    return feedRow.id;
  });
}
export async function previewStatements(raw: unknown) {
  return execute("EDITOR", async (tx, userId) => {
    const p = await prepare(tx, userId, raw);
    return p.rows;
  });
}
export async function importStatements(raw: unknown) {
  return execute("EDITOR", async (tx, userId, ws) => {
    const { v, feed, rows } = await prepare(tx, userId, raw);
    let imported = 0,
      posted = 0;
    for (const r of rows) {
      if (r.duplicate) continue;
      const row = await tx.statementRow.create({
        data: {
          userId,
          feedId: feed.id,
          fingerprint: r.fingerprint,
          date: new Date(r.date),
          description: r.description,
          amount: r.amount,
          reference: r.reference || null,
          fileName: v.fileName,
        },
      });
      imported++;
      if (v.allowAutomatic && r.suggestion?.automatic) {
        await postStatement(
          tx,
          userId,
          feed,
          row,
          r.suggestion.accountId,
          "自動登録ルール",
        );
        posted++;
      }
    }
    await recordAudit(tx, ws, {
      action: "STATEMENT_IMPORT",
      entity: "STATEMENT",
      entityId: feed.id,
      summary: `明細を取込（${v.fileName.slice(0, 80)}）${imported}件、自動登録${posted}件`,
    });
    return { imported, posted, duplicates: rows.length - imported };
  });
}
const rowSchema = z.object({
  id: z.string().min(1),
  version: z.string().datetime(),
});
/**
 * 明細と「同じ日・同じ口座・同じ金額」で、まだ明細と結びついていない記録を探す。
 * 照合の条件は decideStatement と同じ。利用者が仕訳IDを調べなくても選べるようにする。
 */
export async function findLinkCandidates(raw: unknown) {
  try {
    const ws = await requireWorkspace("EDITOR");
    const { id } = z.object({ id: z.string().min(1) }).parse(raw);
    const row = await prisma.statementRow.findFirst({
      where: { id, userId: ws.ownerId, status: "PENDING" },
    });
    if (!row) return { ok: false as const, error: "明細が見つかりません。" };
    const { feed } = await ownedFeed(prisma, ws.ownerId, row.feedId);
    const entries = await prisma.journalEntry.findMany({
      where: {
        userId: ws.ownerId,
        date: row.date,
        reversalOf: null,
        source: { not: "STATEMENT" },
        lines: { some: { accountId: feed.accountId } },
      },
      include: { lines: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const ids = entries.map((e) => e.id);
    const [cancelled, taken] = await Promise.all([
      prisma.journalEntry.findMany({
        where: { userId: ws.ownerId, reversalOf: { in: ids } },
        select: { reversalOf: true },
      }),
      prisma.statementRow.findMany({
        where: {
          userId: ws.ownerId,
          feedId: feed.id,
          entryId: { in: ids },
          status: { in: ["POSTED", "LINKED"] },
        },
        select: { entryId: true },
      }),
    ]);
    const skip = new Set([
      ...cancelled.map((c) => c.reversalOf),
      ...taken.map((t) => t.entryId),
    ]);
    const candidates = entries
      .filter(
        (e) =>
          !skip.has(e.id) &&
          e.lines
            .filter((l) => l.accountId === feed.accountId)
            .reduce((n, l) => n + l.debit - l.credit, 0) === row.amount,
      )
      .map((e) => ({ id: e.id, memo: e.memo, date: dateText(e.date) }));
    return { ok: true as const, candidates };
  } catch (e) {
    if (e instanceof PermissionError)
      return { ok: false as const, error: e.message };
    return { ok: false as const, error: "候補を探せませんでした。" };
  }
}

export async function decideStatement(raw: unknown) {
  return execute("EDITOR", async (tx, userId, ws) => {
    const v = rowSchema
      .extend({
        action: z.enum(["approve", "ignore", "undo", "link"]),
        counterAccountId: z.string().optional(),
        learn: z.boolean().default(true),
        entryId: z.string().optional(),
      })
      .parse(raw);
    await recordAudit(tx, ws, {
      action: "STATEMENT_" + v.action.toUpperCase(),
      entity: "STATEMENT",
      entityId: v.id,
      summary: `明細を${{ approve: "承認・仕訳登録", ignore: "対象外に設定", undo: "登録を取消", link: "既存仕訳と照合" }[v.action]}`,
    });
    const row = await tx.statementRow.findFirst({
      where: { id: v.id, userId },
    });
    if (!row) throw new Error("明細が見つかりません。");
    if (row.updatedAt.toISOString() !== v.version)
      throw new Error("明細は更新済みです。再読み込みしてください。");
    const { feed } = await ownedFeed(tx, userId, row.feedId);
    if (v.action === "undo") {
      if (row.status === "PENDING") throw new Error("この明細は未処理です。");
      if (row.status === "POSTED" && row.entryId) {
        await reverseJournal(
          tx,
          userId,
          row.entryId,
          dateText(row.date),
          `CSV明細の登録取消: ${row.description}`,
        );
        await tx.statementRule.updateMany({
          where: {
            userId,
            feedId: feed.id,
            descriptionKey: normalizeDescription(row.description),
            direction: direction(row.amount),
          },
          data: { automatic: false },
        });
      }
      await tx.statementRow.update({
        where: { id: row.id },
        data: { status: "PENDING", entryId: null, decision: null },
      });
      return;
    }
    if (row.status !== "PENDING")
      throw new Error("未処理の明細を選択してください。");
    if (v.action === "ignore") {
      await tx.statementRow.update({
        where: { id: row.id },
        data: { status: "IGNORED", decision: "利用者が対象外に変更" },
      });
      return;
    }
    if (v.action === "link") {
      if (!v.entryId) throw new Error("帳簿の仕訳IDを入力してください。");
      const entry = await tx.journalEntry.findFirst({
        where: { id: v.entryId, userId },
        include: { lines: true },
      });
      const reversed = await tx.journalEntry.findFirst({
        where: { userId, reversalOf: v.entryId },
      });
      const linked = await tx.statementRow.findFirst({
        where: {
          userId,
          feedId: feed.id,
          entryId: v.entryId,
          status: { in: ["POSTED", "LINKED"] },
        },
      });
      if (
        !entry ||
        entry.reversalOf ||
        reversed ||
        linked ||
        entry.source === "STATEMENT" ||
        dateText(entry.date) !== dateText(row.date) ||
        entry.lines
          .filter((l) => l.accountId === feed.accountId)
          .reduce((s, l) => s + l.debit - l.credit, 0) !== row.amount
      )
        throw new Error(
          "同日・同じ口座科目・同額で未照合の有効な仕訳を指定してください。CSV由来の仕訳は照合できません。",
        );
      await tx.statementRow.update({
        where: { id: row.id },
        data: {
          status: "LINKED",
          entryId: entry.id,
          decision: "既存仕訳と照合（新規計上なし）",
        },
      });
      return;
    }
    if (!v.counterAccountId) throw new Error("相手科目を選択してください。");
    await postStatement(
      tx,
      userId,
      feed,
      row,
      v.counterAccountId,
      "利用者が確認して登録",
    );
    if (v.learn)
      await tx.statementRule.upsert({
        where: {
          userId_feedId_descriptionKey_direction: {
            userId,
            feedId: feed.id,
            descriptionKey: normalizeDescription(row.description),
            direction: direction(row.amount),
          },
        },
        create: {
          userId,
          feedId: feed.id,
          descriptionKey: normalizeDescription(row.description),
          direction: direction(row.amount),
          counterAccountId: v.counterAccountId,
        },
        update: {
          counterAccountId: v.counterAccountId,
          automatic: false,
          active: true,
        },
      });
  });
}
export async function updateStatementRule(raw: unknown) {
  return execute("ADMIN", async (tx, userId, ws) => {
    const v = z
      .object({
        id: z.string().min(1),
        version: z.string().datetime(),
        active: z.boolean(),
        automatic: z.boolean(),
      })
      .parse(raw);
    await recordAudit(tx, ws, {
      action: "RULE_UPDATE",
      entity: "STATEMENT",
      entityId: v.id,
      summary: `自動登録ルールを${v.active ? "有効" : "停止"}・自動登録${v.automatic ? "オン" : "オフ"}に設定`,
    });
    const rule = await tx.statementRule.findFirst({
      where: { id: v.id, userId },
      include: { counterAccount: true },
    });
    if (!rule || rule.updatedAt.toISOString() !== v.version)
      throw new Error("ルールが更新されています。再読み込みしてください。");
    await ownedFeed(tx, userId, rule.feedId);
    if (v.automatic && (!v.active || !rule.counterAccount.active))
      throw new Error("有効なルールと科目のみ自動登録できます。");
    await tx.statementRule.update({
      where: { id: rule.id },
      data: { active: v.active, automatic: v.automatic },
    });
  });
}
