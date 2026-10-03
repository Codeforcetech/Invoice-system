"use server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
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

async function execute<T>(fn: (tx: Tx, userId: string) => Promise<T>) {
  const user = await requireUser();
  try {
    const data = await prisma.$transaction(
      async (tx) => {
        await accountingLock(tx, user.id);
        return fn(tx, user.id);
      },
      { timeout: 30000 },
    );
    revalidatePath("/accounting", "layout");
    return { ok: true as const, data };
  } catch (e) {
    const error =
      e instanceof z.ZodError
        ? "入力内容を確認してください。"
        : e instanceof Error && !("code" in e) && !e.message.includes("\n")
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
  return execute(async (tx, userId) => {
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
    return (await tx.statementFeed.create({ data: { ...v, userId } })).id;
  });
}
export async function previewStatements(raw: unknown) {
  return execute(async (tx, userId) => {
    const p = await prepare(tx, userId, raw);
    return p.rows;
  });
}
export async function importStatements(raw: unknown) {
  return execute(async (tx, userId) => {
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
    return { imported, posted, duplicates: rows.length - imported };
  });
}
const rowSchema = z.object({
  id: z.string().min(1),
  version: z.string().datetime(),
});
export async function decideStatement(raw: unknown) {
  return execute(async (tx, userId) => {
    const v = rowSchema
      .extend({
        action: z.enum(["approve", "ignore", "undo", "link"]),
        counterAccountId: z.string().optional(),
        learn: z.boolean().default(true),
        entryId: z.string().optional(),
      })
      .parse(raw);
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
  return execute(async (tx, userId) => {
    const v = z
      .object({
        id: z.string().min(1),
        version: z.string().datetime(),
        active: z.boolean(),
        automatic: z.boolean(),
      })
      .parse(raw);
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
