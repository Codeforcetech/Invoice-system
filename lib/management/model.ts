import { z } from "zod";
import { daySchema } from "@/lib/accounting/model";
import { monthDistance, shiftMonth, validMonth } from "@/lib/dashboard/sales";
export const reportViews = {
  receipts: "入金予定",
  payments: "支払予定",
  revenue: "収益",
  costs: "費用",
  profit: "損益",
  cash: "資金繰り",
  departments: "部門別",
  tags: "分類・振込先",
} as const;
export const filterSchema = z
  .object({
    view: z
      .enum([
        "receipts",
        "payments",
        "revenue",
        "costs",
        "profit",
        "cash",
        "departments",
        "tags",
      ])
      .default("profit"),
    from: z.string().refine(validMonth),
    to: z.string().refine(validMonth),
    department: z.string().max(60).default(""),
    office: z.string().max(60).default(""),
  })
  .refine(
    (v) => v.from <= v.to && monthDistance(v.from, v.to) < 24,
    "期間は24か月以内で指定してください。",
  );
export type Filters = z.infer<typeof filterSchema>;
export const annotationSchema = z
  .object({
    targetType: z.enum(["INVOICE", "EXPENSE", "CLAIM", "ASSET", "JOURNAL"]),
    targetId: z.string().min(1).max(200),
    version: z.coerce.number().int().nonnegative(),
    department: z.string().trim().max(60),
    office: z.string().trim().max(60),
    plannedDate: z.union([daySchema, z.literal("")]).default(""),
    bankCode: z.string().default(""),
    branchCode: z.string().default(""),
    bankAccountType: z.string().default(""),
    bankAccountNumber: z.string().default(""),
    bankAccountHolder: z.string().trim().default(""),
  })
  .superRefine((v, ctx) => {
    const bank = [
      v.bankCode,
      v.branchCode,
      v.bankAccountType,
      v.bankAccountNumber,
      v.bankAccountHolder,
    ];
    if (
      bank.some(Boolean) &&
      (!["EXPENSE", "CLAIM"].includes(v.targetType) ||
        !/^\d{4}$/.test(v.bankCode) ||
        !/^\d{3}$/.test(v.branchCode) ||
        !/^[12]$/.test(v.bankAccountType) ||
        !/^\d{7}$/.test(v.bankAccountNumber) ||
        !/^[ｦ-ﾟA-Z0-9 ()\.\-/]{1,30}$/.test(v.bankAccountHolder))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "振込先は銀行4桁・支店3桁・口座7桁、口座名義は半角カナ・英大文字・数字等30文字以内で入力してください。",
      });
    if (v.plannedDate && v.targetType !== "CLAIM")
      ctx.addIssue({
        code: "custom",
        message: "精算予定日は経費精算にのみ設定できます。",
      });
  });
export type Annotation = {
  targetType: string;
  targetId: string;
  department: string;
  office: string;
  plannedDate: string;
  bankCode: string;
  branchCode: string;
  bankAccountType: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  version: number;
};
export const emptyAnnotation = (
  targetType: string,
  targetId: string,
): Annotation => ({
  targetType,
  targetId,
  department: "",
  office: "",
  plannedDate: "",
  bankCode: "",
  branchCode: "",
  bankAccountType: "",
  bankAccountNumber: "",
  bankAccountHolder: "",
  version: 0,
});
export type Target = {
  key: string;
  type: string;
  id: string;
  name: string;
  date: string;
  amount: number;
  href: string;
  annotation: Annotation;
};
export const annotationKey = (type: string, id: string) => `${type}:${id}`;
export function matches(
  a: Pick<Annotation, "department" | "office"> | undefined,
  f: Filters,
) {
  return (
    (!f.department ||
      (f.department === "__none__"
        ? !a?.department
        : a?.department === f.department)) &&
    (!f.office ||
      (f.office === "__none__" ? !a?.office : a?.office === f.office))
  );
}
export type Journal = {
  id: string;
  date: string;
  memo: string;
  source: string;
  sourceId: string | null;
  reversalOf: string | null;
  lines: {
    debit: number;
    credit: number;
    account: { id: string; name: string; kind: string; code: string };
  }[];
};
export function journalTarget(
  e: Pick<Journal, "id" | "source" | "sourceId" | "reversalOf">,
  originals: Map<
    string,
    Pick<Journal, "id" | "source" | "sourceId" | "reversalOf">
  >,
): { type: string; id: string } {
  if (e.reversalOf) {
    const original = originals.get(e.reversalOf);
    if (!original || original.reversalOf)
      throw new Error("取消元の仕訳を確認できません。");
    return journalTarget(original, originals);
  }
  const type = (
    {
      INVOICE: "INVOICE",
      RECEIPT: "INVOICE",
      EXPENSE: "EXPENSE",
      PAYMENT: "EXPENSE",
      CLAIM: "CLAIM",
      CLAIM_PAYMENT: "CLAIM",
      DEPRECIATION: "ASSET",
    } as Record<string, string>
  )[e.source];
  return type && e.sourceId
    ? { type, id: e.sourceId }
    : { type: "JOURNAL", id: e.id };
}
export type AmountRow = { name: string; amount: number };
export function groupAmounts(rows: AmountRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.name, (map.get(r.name) ?? 0) + r.amount);
  return [...map]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ja"));
}
export function summarizeLedger(
  entries: Journal[],
  f: Filters,
  annotations: Map<string, Annotation>,
  originals: Map<string, Journal>,
) {
  const months = Array.from(
    { length: monthDistance(f.from, f.to) + 1 },
    (_, i) => ({
      month: shiftMonth(f.from, i),
      revenue: 0,
      cost: 0,
      profit: 0,
    }),
  );
  const costs: AmountRow[] = [],
    departments = new Map<
      string,
      { name: string; revenue: number; cost: number; profit: number }
    >();
  for (const e of entries) {
    const target = journalTarget(e, originals),
      a = annotations.get(annotationKey(target.type, target.id));
    if (!matches(a, f)) continue;
    const m = months.find((m) => m.month === e.date.slice(0, 7));
    if (!m) continue;
    const label = a?.department || "未分類";
    const d = departments.get(label) ?? {
      name: label,
      revenue: 0,
      cost: 0,
      profit: 0,
    };
    for (const l of e.lines) {
      if (l.account.kind === "REVENUE") {
        m.revenue += l.credit - l.debit;
        d.revenue += l.credit - l.debit;
      }
      if (l.account.kind === "EXPENSE") {
        m.cost += l.debit - l.credit;
        d.cost += l.debit - l.credit;
        costs.push({
          name: `${l.account.code} ${l.account.name}`,
          amount: l.debit - l.credit,
        });
      }
    }
    m.profit = m.revenue - m.cost;
    d.profit = d.revenue - d.cost;
    departments.set(label, d);
  }
  return {
    months,
    costs: groupAmounts(costs),
    departments: [...departments.values()].sort(
      (a, b) => b.revenue - a.revenue,
    ),
    revenue: months.reduce((s, m) => s + m.revenue, 0),
    cost: months.reduce((s, m) => s + m.cost, 0),
    profit: months.reduce((s, m) => s + m.profit, 0),
  };
}
export type DueRow = {
  key: string;
  name: string;
  description: string;
  due: string;
  amount: number;
  href: string;
  kind: string;
  annotation: Annotation;
};
export function forecast(
  today: string,
  opening: number | null,
  incoming: DueRow[],
  outgoing: DueRow[],
) {
  const months = Array.from({ length: 6 }, (_, i) => ({
    month: shiftMonth(today.slice(0, 7), i),
    incoming: 0,
    outgoing: 0,
    net: 0,
    balance: null as number | null,
  }));
  for (const [rows, field] of [
    [incoming, "incoming"],
    [outgoing, "outgoing"],
  ] as const)
    for (const r of rows) {
      // Overdue dates are not silently assumed to be collectible today.
      if (!r.due || r.due < today) continue;
      const m = months.find((m) => m.month === r.due.slice(0, 7));
      if (m) m[field] += r.amount;
    }
  let balance = opening;
  for (const m of months) {
    m.net = m.incoming - m.outgoing;
    if (balance !== null) balance += m.net;
    m.balance = balance;
  }
  return {
    months,
    overdueIncoming: incoming
      .filter((r) => r.due && r.due < today)
      .reduce((s, r) => s + r.amount, 0),
    overdueOutgoing: outgoing
      .filter((r) => r.due && r.due < today)
      .reduce((s, r) => s + r.amount, 0),
    undated: outgoing.filter((r) => !r.due).reduce((s, r) => s + r.amount, 0),
  };
}
