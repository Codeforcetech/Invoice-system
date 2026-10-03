import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { daySchema, dateText, debitNormal } from "./model";
import {
  buildTaxRows,
  taxReportHeaders,
  taxReportPdfWidths,
} from "./tax-report";
import { isTaxCategory, taxCategoryInfo } from "@/lib/tax/categories";
type EntryWithLines = Prisma.JournalEntryGetPayload<{
  include: { lines: { include: { account: true } } };
}>;
export const reportSchema = z
  .object({
    view: z
      .enum(["journal", "ledger", "transactions", "tax"])
      .default("journal"),
    from: daySchema,
    to: daySchema,
    accountId: z.string().max(100).default(""),
  })
  .refine((v) => v.from <= v.to, "開始日と終了日を確認してください");
export async function accountingReport(userId: string, raw: unknown) {
  return prisma.$transaction((tx) => buildReport(tx, userId, raw), {
    isolationLevel: "RepeatableRead",
    timeout: 20000,
  });
}
async function buildReport(
  db: Prisma.TransactionClient,
  userId: string,
  raw: unknown,
) {
  const f = reportSchema.parse(raw);
  const account = f.accountId
    ? await db.account.findFirst({ where: { id: f.accountId, userId } })
    : null;
  if (f.view === "ledger" && !account)
    throw new Error("元帳を表示する勘定科目を選択してください。");
  if (f.view === "tax") {
    const grouped = await db.journalLine.groupBy({
      by: ["accountId", "taxCategory"],
      where: {
        userId,
        entry: { date: { gte: new Date(f.from), lte: new Date(f.to) } },
      },
      _sum: { debit: true, credit: true },
    });
    const kinds = new Map(
      (
        await db.account.findMany({
          where: { userId, id: { in: grouped.map((g) => g.accountId) } },
          select: { id: true, kind: true },
        })
      ).map((a) => [a.id, a.kind]),
    );
    return {
      f,
      account: null,
      entries: [] as EntryWithLines[],
      opening: 0,
      balance: 0,
      rows: buildTaxRows(
        grouped.map((g) => ({
          kind: kinds.get(g.accountId) ?? "",
          taxCategory: g.taxCategory,
          debit: g._sum.debit ?? 0,
          credit: g._sum.credit ?? 0,
        })),
      ),
      headers: taxReportHeaders,
      title: "消費税区分別集計",
      widths: taxReportPdfWidths as number[] | undefined,
    };
  }
  const entries = await db.journalEntry.findMany({
    where: {
      userId,
      date: { gte: new Date(f.from), lte: new Date(f.to) },
      ...(f.view === "ledger"
        ? { lines: { some: { accountId: account!.id } } }
        : {}),
    },
    include: { lines: { include: { account: true }, orderBy: { id: "asc" } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: 5001,
  });
  if (entries.length > 5000)
    throw new Error("対象が5,000件を超えています。期間を短くしてください。");
  let opening = 0;
  if (account) {
    const sums = await db.journalLine.aggregate({
      where: {
        userId,
        accountId: account.id,
        entry: { date: { lt: new Date(f.from) } },
      },
      _sum: { debit: true, credit: true },
    });
    opening =
      ((sums._sum.debit ?? 0) - (sums._sum.credit ?? 0)) *
      (debitNormal(account.kind) ? 1 : -1);
  }
  let balance = opening;
  const rows: (string | number)[][] = [];
  if (f.view === "ledger") rows.push([f.from, "繰越", "", 0, 0, opening]);
  for (const e of entries) {
    if (f.view === "ledger") {
      for (const l of e.lines.filter((l) => l.accountId === account!.id)) {
        balance += (l.debit - l.credit) * (debitNormal(account!.kind) ? 1 : -1);
        rows.push([
          dateText(e.date),
          e.memo,
          e.lines
            .filter((x) => x.accountId !== account!.id)
            .map((x) => x.account.name)
            .join(" / ") || "同一科目",
          l.debit,
          l.credit,
          balance,
        ]);
      }
    } else
      for (const l of e.lines)
        rows.push([
          dateText(e.date),
          e.id,
          e.memo,
          l.account.code,
          l.account.name,
          l.debit,
          l.credit,
          e.source === "MANUAL"
            ? "手入力"
            : e.source === "REVERSAL"
              ? "取消"
              : e.source,
          e.sourceId ?? "",
          isTaxCategory(l.taxCategory)
            ? taxCategoryInfo[l.taxCategory].label
            : "",
        ]);
  }
  return {
    f,
    account,
    entries,
    opening,
    balance,
    rows,
    widths: undefined as number[] | undefined,
    headers:
      f.view === "ledger"
        ? ["日付", "摘要", "相手科目", "借方", "貸方", "残高"]
        : [
            "日付",
            "伝票ID",
            "摘要",
            "科目コード",
            "勘定科目",
            "借方",
            "貸方",
            "入力元",
            "連携ID",
            "消費税区分",
          ],
    title:
      f.view === "ledger"
        ? `総勘定元帳 / ${account!.name}`
        : f.view === "transactions"
          ? "取引データ"
          : "仕訳帳",
  };
}
