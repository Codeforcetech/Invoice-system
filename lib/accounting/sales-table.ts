import type { Prisma, PrismaClient } from "@prisma/client";
import { isTaxCategory, taxCategoryInfo } from "@/lib/tax/categories";
import { monthlyRowsWithMeta, yearMonths, type Basis } from "./monthly";

/** 表で集計に使う明細の件数の上限（それぞれ1年あたり）。超えたら、画面に警告を出す。 */
export const SALES_TABLE_LIMIT = 10000;

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
): Promise<{ lines: SalesLine[]; truncated: boolean }> {
  const months = yearMonths(`${year}-01`);
  const { rows, truncated } = await monthlyRowsWithMeta(
    db,
    ws,
    months[0],
    months[11],
    basis,
    SALES_TABLE_LIMIT,
  );
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
  return { lines, truncated };
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
export type TableBlock = {
  id: string;
  name: string;
  /** 取引先ぜんたいの売上・費用（店舗の合計）。常に表示する */
  summary: TableRow[];
  /** 店舗ごとの売上・費用。店舗を使わない取引先は空 */
  stores: TableRow[];
  salesTotal: number;
  costTotal: number;
  hasData: boolean;
};
export type SalesTable = {
  /** 検索・並び順を反映した、取引先ごとのまとまり（ページ分けの前） */
  blocks: TableBlock[];
  /** 全体の合計（検索に関係なく、すべての取引先） */
  totals: TableRow[];
  /** 検索で絞ったときの合計（絞っていないときは null） */
  shownTotals: TableRow[] | null;
  /** データがないため、表に出していない取引先の数 */
  hiddenEmpty: number;
};
export type BuildOptions = {
  mode: "gross" | "net";
  /** 取引先名の検索（全角半角・大文字小文字は区別しない） */
  query?: string;
  sort?: "sales" | "name";
  /** データのない取引先も出す */
  showAll?: boolean;
};

const zero = () => Array<number>(12).fill(0);
const sumOf = (a: number[]) => a.reduce((n, v) => n + v, 0);
const fold = (v: string) =>
  v.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");

export function buildSalesTable(
  lines: SalesLine[],
  companies: {
    id: string;
    name: string;
    stores: { id: string; name: string; active: boolean }[];
  }[],
  opts: BuildOptions,
): SalesTable {
  const { mode } = opts;
  type Acc = { sales: number[]; cost: number[]; used: boolean };
  const acc = new Map<string, Map<string, Acc>>(); // 取引先 → 店舗 → 月ごとの数字
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

  const order = [
    ...companies.map((c) => ({ id: c.id, name: c.name, stores: c.stores })),
    { id: UNASSIGNED, name: UNASSIGNED_NAME, stores: [] },
  ];
  const all: TableBlock[] = [];
  for (const c of order) {
    const used = acc.get(c.id);
    const storeKeys = c.stores
      .filter((s) => s.active || used?.get(s.id)?.used)
      .map((s) => ({ id: s.id, name: s.name }));
    const hasNoStore = used?.get(UNASSIGNED)?.used;
    const sumSales = zero(),
      sumCost = zero();
    const stores: TableRow[] = [];
    if (storeKeys.length) {
      const push = (id: string, name: string) => {
        const a = used?.get(id) ?? { sales: zero(), cost: zero(), used: false };
        stores.push(mk(name, "SALES", a.sales, c.id, id));
        stores.push(mk(name, "COST", a.cost, c.id, id));
      };
      for (const s of storeKeys) push(s.id, s.name);
      if (hasNoStore) push(UNASSIGNED, NO_STORE_NAME);
    }
    for (const a of used?.values() ?? []) {
      a.sales.forEach((v, i) => (sumSales[i] += v));
      a.cost.forEach((v, i) => (sumCost[i] += v));
    }
    all.push({
      id: c.id,
      name: c.name,
      summary: [
        mk("", "SALES", sumSales, c.id, "", stores.length > 0),
        mk("", "COST", sumCost, c.id, "", stores.length > 0),
      ],
      stores,
      salesTotal: sumOf(sumSales),
      costTotal: sumOf(sumCost),
      hasData: !!used && [...used.values()].some((a) => a.used),
    });
  }

  const sums = (blocks: TableBlock[]) => {
    const s = zero(),
      c = zero();
    for (const b of blocks) {
      b.summary[0].months.forEach((v, i) => (s[i] += v));
      b.summary[1].months.forEach((v, i) => (c[i] += v));
    }
    const profit = s.map((v, i) => v - c[i]);
    return [
      mk("全体の合計", "SALES", s, "", "", true),
      mk("全体の合計", "COST", c, "", "", true),
      {
        label: "全体の合計",
        kind: "PROFIT" as const,
        months: profit,
        total: sumOf(profit),
        scope: { company: "", store: "", kind: "" as const },
        subtotal: true,
      },
    ];
  };

  const q = fold(opts.query ?? "");
  const visible = all.filter((b) => opts.showAll || b.hasData);
  const matched = q ? visible.filter((b) => fold(b.name).includes(q)) : visible;
  const sorted = [...matched].sort((a, b) => {
    // 「取引先の指定なし」は、いつも最後
    if ((a.id === UNASSIGNED) !== (b.id === UNASSIGNED))
      return a.id === UNASSIGNED ? 1 : -1;
    if (opts.sort === "name") return a.name.localeCompare(b.name, "ja");
    return (
      b.salesTotal - a.salesTotal ||
      b.costTotal - a.costTotal ||
      a.name.localeCompare(b.name, "ja")
    );
  });
  return {
    blocks: sorted,
    totals: sums(all),
    shownTotals: q ? sums(sorted) : null,
    hiddenEmpty: all.length - all.filter((b) => b.hasData).length,
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
