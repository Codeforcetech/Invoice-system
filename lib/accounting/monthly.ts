import type { Prisma, PrismaClient } from "@prisma/client";
import { isTaxCategory, taxCategoryInfo } from "@/lib/tax/categories";
import { visibleClaimWhere } from "@/lib/claims/access";
import { backOutTax } from "./tax-report";
import { dateText } from "./model";
import { monthRange, shiftMonthText } from "./received";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 月ごとの売上・費用の表。スプレッドシートで作っている「月別の売上と費用（取引先つき）」の代わり。
 * - 売上: 入金された月で数える（入金日が記録された請求書）。手入力・明細取込の売上も含める。
 * - 費用: 「支払った月」または「発生した月」を選べる。
 * 金額は税込を基本に、税抜（参考値）にも切り替えられる。
 */
export type Basis = "paid" | "incurred";
export type MonthlyRow = {
  key: string;
  kind: "SALES" | "COST";
  date: string;
  month: string;
  party: string;
  content: string;
  source: string;
  gross: number;
  tax: number;
  net: number;
  /** 消費税の区分が分からず、税抜＝税込として扱った行 */
  taxUnknown: boolean;
  href: string | null;
};

function split(gross: number, category: string | null) {
  if (isTaxCategory(category)) {
    const info = taxCategoryInfo[category];
    const tax = info.taxable ? backOutTax(gross, info.rateBps) : 0;
    return { tax, net: gross - tax, taxUnknown: false };
  }
  return { tax: 0, net: gross, taxUnknown: true };
}

export async function monthlyRows(
  db: Db,
  ws: { ownerId: string; userId: string },
  fromMonth: string,
  toMonth: string,
  basis: Basis,
): Promise<MonthlyRow[]> {
  return (await monthlyRowsWithMeta(db, ws, fromMonth, toMonth, basis)).rows;
}

/** monthlyRows に加えて、件数の上限に達して、一部が含まれていないかも返す。取引先が多い事業所の表で使う。 */
export async function monthlyRowsWithMeta(
  db: Db,
  ws: { ownerId: string; userId: string },
  fromMonth: string,
  toMonth: string,
  basis: Basis,
  limit = 2000,
): Promise<{ rows: MonthlyRow[]; truncated: boolean }> {
  const gte = monthRange(fromMonth).gte,
    lt = monthRange(toMonth).lt;
  const months: string[] = [];
  for (
    let m = fromMonth;
    m <= toMonth && months.length < 24;
    m = shiftMonthText(m, 1)
  )
    months.push(m);
  const rows: MonthlyRow[] = [];

  // 4つの問い合わせは、互いに待たずに、同時に行う。
  const invoicesQ = db.invoice.findMany({
    where: {
      createdById: ws.ownerId,
      status: "ISSUED",
      mergedIntoId: null,
      receivedDate: { gte, lt },
    },
    select: {
      id: true,
      invoiceNumber: true,
      subject: true,
      subtotal: true,
      taxAmount: true,
      totalWithTax: true,
      receivedDate: true,
      company: { select: { name: true } },
    },
    orderBy: { receivedDate: "asc" },
    take: limit,
  });
  const expensesQ = db.expense.findMany({
    where:
      basis === "paid"
        ? { userId: ws.ownerId, paidDate: { gte, lt } }
        : { userId: ws.ownerId, costMonth: { in: months } },
    select: {
      id: true,
      supplier: true,
      description: true,
      amount: true,
      taxCategory: true,
      costMonth: true,
      paidDate: true,
    },
    take: limit,
  });
  const claimsQ = db.expenseClaim.findMany({
    where: {
      AND: [
        visibleClaimWhere(ws.userId),
        {
          ownerId: ws.ownerId,
          ...(basis === "paid"
            ? { status: "PAID", paidDate: { gte, lt } }
            : { status: { in: ["APPROVED", "PAID"] }, date: { gte, lt } }),
        },
      ],
    },
    select: {
      id: true,
      title: true,
      merchant: true,
      amount: true,
      date: true,
      paidDate: true,
      applicant: { select: { name: true } },
    },
    take: limit,
  });
  const linesQ = db.journalLine.findMany({
    where: {
      userId: ws.ownerId,
      account: { kind: { in: ["EXPENSE", "REVENUE"] } },
      entry: {
        // 手入力と、銀行・カード明細から記録した仕訳。請求書や支払管理などから自動で作られた仕訳は、元のデータで数える。
        source: { in: ["MANUAL", "STATEMENT"] },
        reversalOf: null,
        date: { gte, lt },
      },
    },
    select: {
      id: true,
      debit: true,
      credit: true,
      taxCategory: true,
      account: { select: { kind: true, name: true } },
      entry: { select: { id: true, date: true, memo: true } },
    },
    take: limit * 2,
  });
  const [invoices, expenses, claims, lines] = await Promise.all([
    invoicesQ,
    expensesQ,
    claimsQ,
    linesQ,
  ]);
  const truncated =
    invoices.length >= limit ||
    expenses.length >= limit ||
    claims.length >= limit ||
    lines.length >= limit * 2;

  // --- 売上（入金月） ---
  for (const i of invoices) {
    const date = dateText(i.receivedDate!);
    rows.push({
      key: `invoice:${i.id}`,
      kind: "SALES",
      date,
      month: date.slice(0, 7),
      party: i.company.name,
      content: `${i.invoiceNumber} ${i.subject}`,
      source: "請求書",
      gross: i.totalWithTax,
      tax: i.taxAmount,
      net: i.subtotal,
      taxUnknown: false,
      href: `/invoices/${i.id}`,
    });
  }

  // --- 費用：支払管理 ---
  for (const e of expenses) {
    const date = basis === "paid" ? dateText(e.paidDate!) : `${e.costMonth}-01`;
    rows.push({
      key: `expense:${e.id}`,
      kind: "COST",
      date,
      month: date.slice(0, 7),
      party: e.supplier,
      content: e.description,
      source: "支払管理",
      gross: e.amount,
      ...split(e.amount, e.taxCategory),
      href: `/expenses/${e.id}/edit`,
    });
  }

  // --- 費用：経費精算（承認済み・精算済み） ---
  for (const c of claims) {
    const date = dateText(basis === "paid" ? c.paidDate! : c.date);
    rows.push({
      key: `claim:${c.id}`,
      kind: "COST",
      date,
      month: date.slice(0, 7),
      party: c.merchant,
      content: `${c.title}（申請：${c.applicant.name}）`,
      source: "経費精算",
      gross: c.amount,
      ...split(c.amount, null),
      href: `/claims/${c.id}`,
    });
  }

  // --- 売上・費用：手入力・明細取込の記録 ---
  const cancelled = lines.length
    ? new Set(
        (
          await db.journalEntry.findMany({
            where: {
              userId: ws.ownerId,
              reversalOf: { in: [...new Set(lines.map((l) => l.entry.id))] },
            },
            select: { reversalOf: true },
          })
        ).map((e) => e.reversalOf),
      )
    : new Set<string | null>();
  for (const l of lines) {
    if (cancelled.has(l.entry.id)) continue;
    const isSales = l.account.kind === "REVENUE";
    const gross = isSales ? l.credit - l.debit : l.debit - l.credit;
    if (!gross) continue;
    const date = dateText(l.entry.date);
    rows.push({
      key: `journal:${l.id}`,
      kind: isSales ? "SALES" : "COST",
      date,
      month: date.slice(0, 7),
      party: l.entry.memo,
      content: l.account.name,
      source: "手入力・明細取込",
      gross,
      ...split(gross, l.taxCategory),
      href: `/accounting?view=money&from=${date}&to=${date}`,
    });
  }
  rows.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.key < b.key ? -1 : 1,
  );
  return { rows, truncated };
}

export type MonthTotal = {
  month: string;
  sales: number;
  cost: number;
  profit: number;
};

/** 税込（gross）か税抜（net）かを選んで、月ごとの合計を出す。 */
export function monthTotals(
  rows: MonthlyRow[],
  months: string[],
  mode: "gross" | "net",
): MonthTotal[] {
  return months.map((month) => {
    let sales = 0,
      cost = 0;
    for (const r of rows) {
      if (r.month !== month) continue;
      if (r.kind === "SALES") sales += r[mode];
      else cost += r[mode];
    }
    return { month, sales, cost, profit: sales - cost };
  });
}

export type PartyTotal = { party: string; amount: number; count: number };

/** 取引先ごとの小計（全角半角・空白の違いは同じ取引先）。 */
export function partyTotals(
  rows: MonthlyRow[],
  mode: "gross" | "net",
): PartyTotal[] {
  const key = (v: string) =>
    v.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja-JP");
  const map = new Map<string, PartyTotal>();
  for (const r of rows) {
    const k = key(r.party);
    const t = map.get(k) ?? { party: r.party, amount: 0, count: 0 };
    t.amount += r[mode];
    t.count++;
    map.set(k, t);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

export const yearMonths = (month: string) =>
  Array.from(
    { length: 12 },
    (_, i) => `${month.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`,
  );

/** 入金待ち（発行済みで、まだ入金日がない請求書）。売上にはまだ入らない。 */
export async function pendingInvoices(
  db: Db,
  ws: { ownerId: string },
  upToMonth: string,
) {
  const lt = monthRange(upToMonth).lt;
  const list = await db.invoice.findMany({
    where: {
      createdById: ws.ownerId,
      status: "ISSUED",
      mergedIntoId: null,
      receivedDate: null,
      issueDate: { lt },
    },
    select: { totalWithTax: true, subtotal: true },
  });
  return {
    count: list.length,
    gross: list.reduce((n, i) => n + i.totalWithTax, 0),
    net: list.reduce((n, i) => n + i.subtotal, 0),
  };
}
