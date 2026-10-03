import type { Prisma, PrismaClient } from "@prisma/client";
import { OPENING_MEMO } from "./easy";

type Db = PrismaClient | Prisma.TransactionClient;

/** 開始残高がすでに登録されているか（取り消されたものは数えない）。 */
export async function hasOpeningBalance(db: Db, ownerId: string) {
  const entries = await db.journalEntry.findMany({
    where: {
      userId: ownerId,
      memo: OPENING_MEMO,
      source: "MANUAL",
      reversalOf: null,
    },
    select: { id: true },
  });
  if (!entries.length) return false;
  const cancelled = await db.journalEntry.count({
    where: { userId: ownerId, reversalOf: { in: entries.map((e) => e.id) } },
  });
  return entries.length > cancelled;
}
