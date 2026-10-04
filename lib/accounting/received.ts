import type { Prisma, PrismaClient } from "@prisma/client";
import { claimStatus } from "@/lib/claims/model";
import { visibleClaimWhere } from "@/lib/claims/access";
import { dateText } from "./model";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 「誰が・いつ・何月分の請求書と領収書を送ってきたか」を、登録済みのデータから1つにまとめる。
 * 新しいデータは作らない。支払管理（請求書）、経費精算（領収書）、証憑ファイルボックスが元になる。
 */
export type ReceivedKind = "INVOICE" | "RECEIPT";
export type ReceivedRow = {
  key: string;
  kind: ReceivedKind;
  /** 画面に出す種類（元の画面の名前つき） */
  label: string;
  /** 送ってきた人・支払先 */
  sender: string;
  /** 何月分か（YYYY-MM） */
  month: string;
  receivedAt: Date;
  amount: number;
  hasFile: boolean;
  fileHref: string | null;
  status: string;
  href: string;
  /** 登録・申請した人（わかる場合） */
  registeredBy: string | null;
};

export const normalizeSender = (v: string) =>
  v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja-JP");

export const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1)),
    lt: new Date(Date.UTC(y, m, 1)),
  };
};
export const shiftMonthText = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
export const validMonthText = (v: string) =>
  /^20\d{2}-(0[1-9]|1[0-2])$/.test(v);

const LIMIT = 300;

export async function receivedRows(
  db: Db,
  ws: { ownerId: string; userId: string },
  month: string,
): Promise<ReceivedRow[]> {
  const range = monthRange(month);
  const [expenses, claims, evidence] = await Promise.all([
    db.expense.findMany({
      where: { userId: ws.ownerId, costMonth: month },
      select: {
        id: true,
        supplier: true,
        description: true,
        category: true,
        amount: true,
        costMonth: true,
        paidDate: true,
        createdAt: true,
        attachment: { select: { expenseId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    db.expenseClaim.findMany({
      where: {
        AND: [
          visibleClaimWhere(ws.userId),
          { ownerId: ws.ownerId, status: { not: "DRAFT" }, date: range },
        ],
      },
      select: {
        id: true,
        title: true,
        merchant: true,
        amount: true,
        date: true,
        status: true,
        createdAt: true,
        applicant: { select: { name: true } },
        receipt: { select: { claimId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
    db.evidenceFile.findMany({
      where: {
        ownerId: ws.ownerId,
        status: "ACTIVE",
        kind: { in: ["RECEIPT", "INVOICE"] },
        // 支払管理から取り込んだ添付は、支払管理の側で数える（二重に数えない）。
        OR: [{ sourceType: null }, { sourceType: { not: "EXPENSE" } }],
        transactionDate: range,
      },
      select: {
        id: true,
        kind: true,
        counterparty: true,
        amount: true,
        transactionDate: true,
        createdAt: true,
        uploadedById: true,
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    }),
  ]);
  const uploaderIds = [...new Set(evidence.map((e) => e.uploadedById))];
  const nameOf = new Map(
    (uploaderIds.length
      ? await db.user.findMany({
          where: { id: { in: uploaderIds } },
          select: { id: true, name: true },
        })
      : []
    ).map((u) => [u.id, u.name]),
  );

  const rows: ReceivedRow[] = [
    ...expenses.map((e): ReceivedRow => ({
      key: `expense:${e.id}`,
      kind: "INVOICE",
      label: "請求書（支払管理）",
      sender: e.supplier,
      month: e.costMonth,
      receivedAt: e.createdAt,
      amount: e.amount,
      hasFile: !!e.attachment,
      fileHref: e.attachment ? `/api/expenses/${e.id}/pdf` : null,
      status: e.paidDate ? "支払済み" : "未払い",
      href: `/expenses/${e.id}/edit`,
      registeredBy: null,
    })),
    ...claims.map((c): ReceivedRow => ({
      key: `claim:${c.id}`,
      kind: "RECEIPT",
      label: "領収書（経費精算）",
      sender: c.applicant.name,
      month: dateText(c.date).slice(0, 7),
      receivedAt: c.createdAt,
      amount: c.amount,
      hasFile: !!c.receipt,
      fileHref: c.receipt ? `/api/claims/${c.id}/receipt` : null,
      status: claimStatus[c.status] ?? c.status,
      href: `/claims/${c.id}`,
      registeredBy: c.applicant.name,
    })),
    ...evidence.map((e): ReceivedRow => ({
      key: `evidence:${e.id}`,
      kind: e.kind === "INVOICE" ? "INVOICE" : "RECEIPT",
      label: `${e.kind === "INVOICE" ? "請求書" : "領収書"}（証憑）`,
      sender: e.counterparty,
      month: dateText(e.transactionDate).slice(0, 7),
      receivedAt: e.createdAt,
      amount: e.amount,
      hasFile: true,
      fileHref: `/api/evidence/${e.id}`,
      status: "保管済み",
      href: `/accounting/evidence/${e.id}`,
      registeredBy: nameOf.get(e.uploadedById) || null,
    })),
  ];
  return rows.sort((a, b) => +b.receivedAt - +a.receivedAt);
}

export type SenderSummary = {
  sender: string;
  invoices: number;
  receipts: number;
  amount: number;
  lastReceivedAt: Date;
  /** 請求書があるのに添付ファイルがない件数 */
  withoutFile: number;
};

/** 送ってきた人ごとの件数と金額（名前の全角半角・空白の違いは同じ人として数える）。 */
export function summarizeBySender(rows: ReceivedRow[]): SenderSummary[] {
  const map = new Map<string, SenderSummary>();
  for (const r of rows) {
    const k = normalizeSender(r.sender);
    const s = map.get(k) ?? {
      sender: r.sender,
      invoices: 0,
      receipts: 0,
      amount: 0,
      lastReceivedAt: r.receivedAt,
      withoutFile: 0,
    };
    if (r.kind === "INVOICE") s.invoices++;
    else s.receipts++;
    s.amount += r.amount;
    if (!r.hasFile) s.withoutFile++;
    if (r.receivedAt > s.lastReceivedAt) s.lastReceivedAt = r.receivedAt;
    map.set(k, s);
  }
  return [...map.values()].sort(
    (a, b) => +b.lastReceivedAt - +a.lastReceivedAt,
  );
}

/** 先月は届いたのに、今月はまだ届いていない人。 */
export function notYetThisMonth(
  current: ReceivedRow[],
  previous: ReceivedRow[],
): string[] {
  const now = new Set(current.map((r) => normalizeSender(r.sender)));
  const seen = new Map<string, string>();
  for (const r of previous) {
    const k = normalizeSender(r.sender);
    if (!now.has(k) && !seen.has(k)) seen.set(k, r.sender);
  }
  return [...seen.values()];
}
