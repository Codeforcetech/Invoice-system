import type { Prisma, PrismaClient } from "@prisma/client";
import { isTaxCategory, taxCategoryInfo } from "@/lib/tax/categories";
import { monthlyRows, yearMonths, type Basis } from "./monthly";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 売上管理表（年・取引先・店舗 × 12か月）。
 * 数え方は「月ごとの売上と費用」と同じ（売上は入金月、費用は支払月か発生月）。
 * 売上は請求書の明細の店舗、費用は支払いの取引先・店舗で分ける。取引先の指定がないものは「取引先の指定なし」に入る。
 */
export type SalesLine = {
  key: string;
  kind: "SALES" | "COST";
  /** YYYY-MM */
  month: string;
  date: string;
  companyId: string | null;
  companyName: string;
  storeId: string | null;
  storeName: string | null;
  party: string;
  content: string;
  source: string;
  gross: number;
  net: number;
  href: string | null;
};

export const UNASSIGNED = "none";
export const UNASSIGNED_NAME = "取引先の指定なし";
export const NO_STORE_NAME = "店舗なし";

type ItemForSplit = {
  amount: number;
  taxCategory: string | null;
  storeId: string | null;
};

/**
 * 1枚の請求書を、店舗ごとに分ける。税抜・消費税の合計は、請求書の金額とぴったり合わせる
 * （端数の差は、税額がいちばん大きい店舗に寄せる）。
 */
export function allocateInvoice(
  inv: { subtotal: number; taxAmount: number; taxRate: number },
  items: ItemForSplit[],
): Map<string | null, { net: number; tax: number }> {
  const out = new Map<string | null, { net: number; tax: number }>();
  if (!items.length) {
    out.set(null, { net: inv.subtotal, tax: inv.taxAmount });
    return out;
  }
  let netSum = 0,
    taxSum = 0;
  for (const it of items) {
    const rate = isTaxCategory(it.taxCategory)
      ? taxCategoryInfo[it.taxCategory].taxable
        ? taxCategoryInfo[it.taxCategory].rateBps
        : 0
      : inv.taxRate;
    const tax = Math.floor((it.amount * rate) / 10000);
    const cur = out.get(it.storeId) ?? { net: 0, tax: 0 };
    cur.net += it.amount;
    cur.tax += tax;
    out.set(it.storeId, cur);
    netSum += it.amount;
    taxSum += tax;
  }
  const biggest = [...out.entries()].sort((a, b) => b[1].tax - a[1].tax)[0][1];
  biggest.net += inv.subtotal - netSum;
  biggest.tax += inv.taxAmount - taxSum;
  return out;
}

export async function salesTableLines(
  db: Db,
  ws: { ownerId: string; userId: string },
  year: string,
  basis: Basis,
): Promise<SalesLine[]> {
  const months = yearMonths(`${year}-01`);
  const rows = await monthlyRows(db, ws, months[0], months[11], basis);
  const idsOf = (prefix: string) =>
    rows
      .filter((r) => r.key.startsWith(prefix))
      .map((r) => r.key.slice(prefix.length));
  const [invoices, expenses, stores] = await Promise.all([
    db.invoice.findMany({
      where: { id: { in: idsOf("invoice:") }, createdById: ws.ownerId },
      select: {
        id: true,
        companyId: true,
        subtotal: true,
        taxAmount: true,
        taxRate: true,
        company: { select: { name: true } },
        items: { select: { amount: true, taxCategory: true, storeId: true } },
      },
    }),
    db.expense.findMany({
      where: { id: { in: idsOf("expense:") }, userId: ws.ownerId },
      select: {
        id: true,
        companyId: true,
        storeId: true,
        company: { select: { name: true } },
      },
    }),
    db.store.findMany({
      where: { company: { userId: ws.ownerId } },
      select: { id: true, name: true },
    }),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  const lines: SalesLine[] = [];
  for (const r of rows) {
    const base = {
      kind: r.kind,
      month: r.month,
      date: r.date,
      party: r.party,
      content: r.content,
      source: r.source,
      href: r.href,
    };
    if (r.key.startsWith("invoice:")) {
      const inv = invoiceById.get(r.key.slice(8));
      if (inv) {
        for (const [storeId, v] of allocateInvoice(inv, inv.items)) {
          lines.push({
            ...base,
            key: `${r.key}:${storeId ?? "-"}`,
            companyId: inv.companyId,
            companyName: inv.company.name,
            storeId,
            storeName: storeId ? (storeName.get(storeId) ?? null) : null,
            gross: v.net + v.tax,
            net: v.net,
          });
        }
        continue;
      }
    }
    if (r.key.startsWith("expense:")) {
      const e = expenseById.get(r.key.slice(8));
      if (e?.companyId) {
        lines.push({
          ...base,
          key: r.key,
          companyId: e.companyId,
          companyName: e.company?.name ?? UNASSIGNED_NAME,
          storeId: e.storeId,
          storeName: e.storeId ? (storeName.get(e.storeId) ?? null) : null,
          gross: r.gross,
          net: r.net,
        });
        continue;
      }
    }
    lines.push({
      ...base,
      key: r.key,
      companyId: null,
      companyName: UNASSIGNED_NAME,
      storeId: null,
      storeName: null,
      gross: r.gross,
      net: r.net,
    });
  }
  return lines;
}

export type TableRow = {
  /** 表の左の見出し（店舗名。店舗を使わない取引先は空） */
  label: string;
  kind: "SALES" | "COST" | "PROFIT";
  /** 1〜12月 */
  months: number[];
  total: number;
  /** 数字を押したときの絞り込み。company: 取引先ID／"none"／""（すべて）、store: 店舗ID／"none"／""（すべて） */
  scope: { company: string; store: string; kind: "SALES" | "COST" | "" };
  subtotal?: boolean;
};
export type TableBlock = { id: string; name: string; rows: TableRow[] };
export type SalesTable = { blocks: TableBlock[]; totals: TableRow[] };

const zero = () => Array<number>(12).fill(0);
const sumOf = (a: number[]) => a.reduce((n, v) => n + v, 0);

export function buildSalesTable(
  lines: SalesLine[],
  companies: {
    id: string;
    name: string;
    stores: { id: string; name: string; active: boolean }[];
  }[],
  mode: "gross" | "net",
): SalesTable {
  type Acc = { sales: number[]; cost: number[]; used: boolean };
  const acc = new Map<string, Map<string, Acc>>(); // companyKey → storeKey → 月ごとの数字
  const get = (c: string, s: string) => {
    const m = acc.get(c) ?? new Map<string, Acc>();
    acc.set(c, m);
    const a = m.get(s) ?? { sales: zero(), cost: zero(), used: false };
    m.set(s, a);
    return a;
  };
  for (const l of lines) {
    const a = get(l.companyId ?? UNASSIGNED, l.storeId ?? UNASSIGNED);
    const i = Number(l.month.slice(5, 7)) - 1;
    (l.kind === "SALES" ? a.sales : a.cost)[i] += l[mode];
    a.used = true;
  }
  const mk = (
    label: string,
    kind: "SALES" | "COST",
    months: number[],
    company: string,
    store: string,
    subtotal = false,
  ): TableRow => ({
    label,
    kind,
    months,
    total: sumOf(months),
    scope: { company, store, kind },
    subtotal,
  });

  const blocks: TableBlock[] = [];
  const order = [
    ...companies.map((c) => ({ id: c.id, name: c.name, stores: c.stores })),
    { id: UNASSIGNED, name: UNASSIGNED_NAME, stores: [] },
  ];
  for (const c of order) {
    const used = acc.get(c.id);
    const active = c.stores.filter((s) => s.active);
    if (!used && !active.length) continue;
    // 店舗の並び: 登録順（使わない店舗は、数字があるときだけ）→ 店舗なし
    const storeKeys = c.stores
      .filter((s) => s.active || used?.get(s.id)?.used)
      .map((s) => ({ id: s.id, name: s.name }));
    const hasNoStore = used?.get(UNASSIGNED)?.used;
    const rows: TableRow[] = [];
    const sumSales = zero(),
      sumCost = zero();
    const push = (id: string, name: string) => {
      const a = used?.get(id) ?? { sales: zero(), cost: zero(), used: false };
      rows.push(mk(name, "SALES", a.sales, c.id, id));
      rows.push(mk(name, "COST", a.cost, c.id, id));
      a.sales.forEach((v, i) => (sumSales[i] += v));
      a.cost.forEach((v, i) => (sumCost[i] += v));
    };
    for (const s of storeKeys) push(s.id, s.name);
    if (hasNoStore || !storeKeys.length)
      push(UNASSIGNED, storeKeys.length ? NO_STORE_NAME : "");
    if (rows.length > 2) {
      rows.push(mk("小計", "SALES", sumSales, c.id, "", true));
      rows.push(mk("小計", "COST", sumCost, c.id, "", true));
    }
    blocks.push({ id: c.id, name: c.name, rows });
  }
  const allSales = zero(),
    allCost = zero();
  for (const m of acc.values())
    for (const a of m.values()) {
      a.sales.forEach((v, i) => (allSales[i] += v));
      a.cost.forEach((v, i) => (allCost[i] += v));
    }
  const profit = allSales.map((v, i) => v - allCost[i]);
  return {
    blocks,
    totals: [
      mk("全体の合計", "SALES", allSales, "", "", true),
      mk("全体の合計", "COST", allCost, "", "", true),
      {
        label: "全体の合計",
        kind: "PROFIT",
        months: profit,
        total: sumOf(profit),
        scope: { company: "", store: "", kind: "" },
        subtotal: true,
      },
    ],
  };
}

/** 数字を押したときの明細（絞り込み）。month は YYYY-MM、空なら年間。 */
export function filterLines(
  lines: SalesLine[],
  f: { month: string; company: string; store: string; kind: string },
) {
  return lines.filter(
    (l) =>
      (!f.month || l.month === f.month) &&
      (!f.kind || l.kind === f.kind) &&
      (!f.company || (l.companyId ?? UNASSIGNED) === f.company) &&
      (!f.store || (l.storeId ?? UNASSIGNED) === f.store),
  );
}
