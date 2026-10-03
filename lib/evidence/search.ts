import type { Prisma, PrismaClient } from "@prisma/client";
import {
  EVIDENCE_PAGE_SIZE,
  counterpartyKey,
  type EvidenceSearch,
} from "./model";

type Db = PrismaClient | Prisma.TransactionClient;

/** 一覧に出す列。ファイルの中身（data）は含めない。 */
export const evidenceListSelect = {
  id: true,
  kind: true,
  transactionDate: true,
  amount: true,
  counterparty: true,
  memo: true,
  filename: true,
  mimeType: true,
  size: true,
  sha256: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  sourceType: true,
} as const;

export function evidenceWhere(
  ownerId: string,
  f: EvidenceSearch,
): Prisma.EvidenceFileWhereInput {
  const key = counterpartyKey(f.counterparty);
  return {
    ownerId,
    ...(f.status === "ALL" ? {} : { status: f.status }),
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.from || f.to
      ? {
          transactionDate: {
            ...(f.from ? { gte: new Date(f.from) } : {}),
            ...(f.to ? { lte: new Date(f.to) } : {}),
          },
        }
      : {}),
    ...(f.amountMin !== undefined || f.amountMax !== undefined
      ? {
          amount: {
            ...(f.amountMin !== undefined ? { gte: f.amountMin } : {}),
            ...(f.amountMax !== undefined ? { lte: f.amountMax } : {}),
          },
        }
      : {}),
    ...(key ? { counterpartyKey: { contains: key } } : {}),
  };
}

/** 取引年月日・金額・取引先の範囲／部分一致と、種類・状態を自由に組み合わせて検索する。 */
export async function searchEvidence(
  db: Db,
  ownerId: string,
  f: EvidenceSearch,
) {
  const where = evidenceWhere(ownerId, f);
  const [rows, total] = await Promise.all([
    db.evidenceFile.findMany({
      where,
      select: evidenceListSelect,
      orderBy: [
        { transactionDate: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      skip: (f.page - 1) * EVIDENCE_PAGE_SIZE,
      take: EVIDENCE_PAGE_SIZE,
    }),
    db.evidenceFile.count({ where }),
  ]);
  return {
    rows,
    total,
    pages: Math.max(1, Math.ceil(total / EVIDENCE_PAGE_SIZE)),
  };
}
