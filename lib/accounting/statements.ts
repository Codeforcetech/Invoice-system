import { createHash } from "node:crypto";
import type { StatementFeed, StatementRow } from "@prisma/client";
import { dateText } from "./model";
import { normalizeDescription, type ParsedStatement } from "./statement-csv";
import { postJournal, type Tx } from "./service";
export const direction = (amount: number) => (amount > 0 ? "IN" : "OUT");
export const statementFingerprint = (r: ParsedStatement) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        r.reference
          ? ["id", r.reference]
          : [
              "content",
              r.date,
              normalizeDescription(r.description),
              r.amount,
              r.occurrence,
            ],
      ),
    )
    .digest("hex");
export async function ownedFeed(tx: Tx, userId: string, feedId: string) {
  const feed = await tx.statementFeed.findFirst({
    where: { id: feedId, userId },
    include: { account: true },
  });
  if (
    !feed ||
    !feed.account.active ||
    feed.account.kind !== (feed.kind === "BANK" ? "ASSET" : "LIABILITY")
  )
    throw new Error("取込口座または勘定科目が利用できません。");
  const setting = await tx.accountingSetting.findUnique({ where: { userId } });
  if (!setting) throw new Error("先に会計の初期設定を行ってください。");
  return { feed, setting };
}
export async function suggestions(tx: Tx, userId: string, feed: StatementFeed) {
  const rules = await tx.statementRule.findMany({
    where: { userId, feedId: feed.id, active: true },
    include: { counterAccount: true },
  });
  // Past manual entries are suggestions only; ambiguous descriptions are never auto-selected.
  const history = await tx.journalEntry.findMany({
    where: {
      userId,
      source: "MANUAL",
      lines: { some: { accountId: feed.accountId } },
    },
    include: { lines: { include: { account: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const reversed = await tx.journalEntry.findMany({
    where: { userId, reversalOf: { in: history.map((e) => e.id) } },
    select: { reversalOf: true },
  });
  const cancelled = new Set(reversed.map((e) => e.reversalOf));
  return (description: string, amount: number) => {
    const key = normalizeDescription(description),
      dir = direction(amount);
    const rule = rules.find(
      (r) => r.descriptionKey === key && r.direction === dir,
    );
    if (
      rule &&
      rule.counterAccount.active &&
      rule.counterAccountId !== feed.accountId
    )
      return {
        accountId: rule.counterAccountId,
        name: rule.counterAccount.name,
        reason: "承認済みルール（摘要・入出金が一致）",
        automatic: rule.automatic,
      };
    const ids = new Map<string, string>();
    for (const e of history) {
      if (
        cancelled.has(e.id) ||
        normalizeDescription(e.memo) !== key ||
        e.lines.length !== 2
      )
        continue;
      const bank = e.lines.find((l) => l.accountId === feed.accountId),
        counter = e.lines.find((l) => l.accountId !== feed.accountId);
      if (
        bank &&
        counter?.account.active &&
        direction(bank.debit - bank.credit) === dir
      )
        ids.set(counter.accountId, counter.account.name);
    }
    if (ids.size === 1) {
      const [accountId, name] = [...ids][0];
      return {
        accountId,
        name,
        reason: "過去の手入力仕訳（摘要・入出金が一致）",
        automatic: false,
      };
    }
    return null;
  };
}
export async function postStatement(
  tx: Tx,
  userId: string,
  feed: StatementFeed,
  row: StatementRow,
  counterAccountId: string,
  decision: string,
) {
  if (counterAccountId === feed.accountId)
    throw new Error("相手科目には取込口座と異なる科目を選択してください。");
  const counter = await tx.account.findFirst({
    where: { id: counterAccountId, userId, active: true },
  });
  if (!counter) throw new Error("相手科目が利用できません。");
  const amount = Math.abs(row.amount);
  const entry = await postJournal(
    tx,
    userId,
    {
      requestKey: `statement:${row.id}:${row.updatedAt.toISOString()}`,
      date: dateText(row.date),
      memo: row.description,
      lines: [
        {
          accountId: feed.accountId,
          debit: row.amount > 0 ? amount : 0,
          credit: row.amount < 0 ? amount : 0,
        },
        {
          accountId: counterAccountId,
          debit: row.amount < 0 ? amount : 0,
          credit: row.amount > 0 ? amount : 0,
        },
      ],
    },
    "STATEMENT",
    row.id,
  );
  await tx.statementRow.update({
    where: { id: row.id },
    data: { entryId: entry.id, status: "POSTED", decision },
  });
  return entry.id;
}
