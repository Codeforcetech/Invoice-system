export type SearchValues = Record<string, string | string[] | undefined>;
export const firstValue = (v: string | string[] | undefined) =>
  (Array.isArray(v) ? v[0] : v) ?? "";
export function validMonth(value: string) {
  return (
    /^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/.test(value) &&
    !value.startsWith("9999")
  );
}
export function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}
export const monthStart = (value: string) =>
  new Date(`${value}-01T00:00:00.000Z`);
export function monthDistance(from: string, to: string) {
  const a = from.split("-").map(Number),
    b = to.split("-").map(Number);
  return (b[0] - a[0]) * 12 + b[1] - a[1];
}
export function resolveSalesFilters(sp: SearchValues = {}, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const current = `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
  let from = firstValue(sp.fromMonth) || current,
    to = firstValue(sp.toMonth) || current;
  let error = "";
  if (
    !validMonth(from) ||
    !validMonth(to) ||
    from > to ||
    monthDistance(from, to) > 23
  ) {
    error =
      "期間は開始月から終了月まで、24か月以内で指定してください。今月の集計を表示しています。";
    from = to = current;
  }
  const length = monthDistance(from, to) + 1;
  const previousFrom = shiftMonth(from, -length),
    previousTo = shiftMonth(from, -1);
  const trendFrom = shiftMonth(to, -Math.max(11, length - 1));
  return {
    current,
    from,
    to,
    previousFrom,
    previousTo,
    trendFrom,
    error,
    queryFrom: previousFrom < trendFrom ? previousFrom : trendFrom,
    companyId: firstValue(sp.companyId).slice(0, 200),
    basis:
      firstValue(sp.basis) === "transfer"
        ? ("transfer" as const)
        : ("net" as const),
  };
}
export type SalesFilters = ReturnType<typeof resolveSalesFilters>;
export type SalesGroup = {
  issueDate: Date;
  companyId: string;
  _sum: { subtotal: number | null; grandTotal: number | null };
  _count: number;
};
export function summarizeSales(
  groups: SalesGroup[],
  companies: { id: string; name: string }[],
  filters: SalesFilters,
) {
  const months = Array.from(
    { length: monthDistance(filters.trendFrom, filters.to) + 1 },
    (_, i) => ({
      month: shiftMonth(filters.trendFrom, i),
      amount: 0,
      count: 0,
    }),
  );
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const byCompany = new Map<
    string,
    { id: string; name: string; amount: number; count: number }
  >();
  let total = 0,
    previous = 0,
    count = 0;
  for (const group of groups) {
    if (filters.companyId && group.companyId !== filters.companyId) continue;
    // Invoice dates are date-only values persisted at UTC midnight.
    const month = group.issueDate.toISOString().slice(0, 7);
    const amount =
      (filters.basis === "net" ? group._sum.subtotal : group._sum.grandTotal) ??
      0;
    const bucket = months.find((m) => m.month === month);
    if (bucket) {
      bucket.amount += amount;
      bucket.count += group._count;
    }
    if (month >= filters.previousFrom && month <= filters.previousTo)
      previous += amount;
    if (month < filters.from || month > filters.to) continue;
    total += amount;
    count += group._count;
    const company = byCompany.get(group.companyId) ?? {
      id: group.companyId,
      name: names.get(group.companyId) ?? "取引先",
      amount: 0,
      count: 0,
    };
    company.amount += amount;
    company.count += group._count;
    byCompany.set(company.id, company);
  }
  return {
    total,
    previous,
    count,
    companyCount: byCompany.size,
    months,
    change: previous > 0 ? ((total - previous) / previous) * 100 : null,
    companies: [...byCompany.values()].sort(
      (a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ja"),
    ),
  };
}
export type SalesSummary = ReturnType<typeof summarizeSales>;
export function invoiceSalesHref(from: string, to: string, companyId = "") {
  const sp = new URLSearchParams({
    status: "ISSUED",
    fromMonth: from,
    toMonth: to,
  });
  if (companyId) sp.set("companyId", companyId);
  return `/invoices?${sp}`;
}
// Shared by invoice drill-down and dashboard, including invalid-range handling.
export function invoiceDateFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  if (
    (from && !validMonth(from)) ||
    (to && !validMonth(to)) ||
    (from && to && from > to)
  )
    throw new Error("請求日の期間が正しくありません。");
  return {
    ...(from ? { gte: monthStart(from) } : {}),
    ...(to ? { lt: monthStart(shiftMonth(to, 1)) } : {}),
  };
}
