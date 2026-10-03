import { Prisma } from "@prisma/client";
import { journalSchema, dateText, type EntryInput } from "./model";
export type Tx = Prisma.TransactionClient;
export async function accountingLock(tx: Tx, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"seiq-accounting:" + userId}))`;
}
export async function postJournal(
  tx: Tx,
  userId: string,
  input: EntryInput,
  source = "MANUAL",
  sourceId?: string,
  reversalOf?: string,
) {
  const parsed = journalSchema.parse({
    ...input,
    requestKey: "11111111-1111-4111-8111-111111111111",
  });
  const existing = await tx.journalEntry.findUnique({
    where: { userId_requestKey: { userId, requestKey: input.requestKey } },
    include: { lines: true },
  });
  if (existing) {
    const signature = (
      lines: { accountId: string; debit: number; credit: number }[],
    ) =>
      JSON.stringify(lines.map((l) => [l.accountId, l.debit, l.credit]).sort());
    if (
      existing.memo !== input.memo ||
      dateText(existing.date) !== input.date ||
      signature(existing.lines) !== signature(input.lines)
    )
      throw new Error(
        "同じ送信キーで異なる仕訳は登録できません。画面を開き直してください。",
      );
    return existing;
  }
  const setting = await tx.accountingSetting.findUnique({ where: { userId } });
  if (!setting) throw new Error("先に会計の初期設定を行ってください。");
  if (parsed.date < dateText(setting.startDate))
    throw new Error("会計開始日以降の日付を指定してください。");
  const ids = [...new Set(parsed.lines.map((l) => l.accountId))];
  const accounts = await tx.account.findMany({
    where: { userId, id: { in: ids }, ...(reversalOf ? {} : { active: true }) },
  });
  if (accounts.length !== ids.length)
    throw new Error("勘定科目が利用できません。最新の一覧を確認してください。");
  return tx.journalEntry.create({
    data: {
      userId,
      requestKey: input.requestKey,
      date: new Date(parsed.date),
      memo: parsed.memo,
      source,
      sourceId,
      reversalOf,
      lines: { create: parsed.lines },
    },
    include: { lines: true },
  });
}
export async function reverseJournal(
  tx: Tx,
  userId: string,
  id: string,
  date: string,
  reason: string,
) {
  const original = await tx.journalEntry.findFirst({
    where: { id, userId },
    include: { lines: true },
  });
  if (!original) throw new Error("対象の仕訳が見つかりません。");
  if (original.reversalOf)
    throw new Error("取消仕訳を再度取り消すことはできません。");
  const existing = await tx.journalEntry.findFirst({
    where: { userId, reversalOf: id },
  });
  if (existing) return existing;
  return postJournal(
    tx,
    userId,
    {
      requestKey: `reverse:${id}`,
      date,
      memo: `取消: ${reason}`.slice(0, 500),
      lines: original.lines.map((l) => ({
        accountId: l.accountId,
        debit: l.credit,
        credit: l.debit,
      })),
    },
    "REVERSAL",
    original.sourceId ?? undefined,
    id,
  );
}
