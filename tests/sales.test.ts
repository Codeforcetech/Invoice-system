import { describe, expect, it } from "vitest";
import {
  invoiceDateFilter,
  invoiceSalesHref,
  resolveSalesFilters,
  summarizeSales,
  type SalesGroup,
} from "@/lib/dashboard/sales";
const now = new Date("2026-09-17T00:00:00Z");
const filters = (sp = {}) => resolveSalesFilters(sp, now);
const group = (
  date: string,
  id: string,
  net: number,
  transfer: number,
  count = 1,
): SalesGroup => ({
  issueDate: new Date(date),
  companyId: id,
  _sum: { subtotal: net, grandTotal: transfer },
  _count: count,
});
const groups = [
  group("2026-08-31", "a", 100000, 99790),
  group("2026-09-01", "a", 200000, 199580, 2),
  group("2026-09-30", "b", 50000, 55000),
  group("2026-10-01", "a", 999, 999),
];
const companies = [
  { id: "a", name: "同名企業" },
  { id: "b", name: "同名企業" },
];
describe("sales reporting", () => {
  it("separates tax-exclusive revenue from transfer amounts and aggregates company IDs, not names", () => {
    const result = summarizeSales(groups, companies, filters());
    expect(result).toMatchObject({
      total: 250000,
      previous: 100000,
      change: 150,
      count: 3,
      companyCount: 2,
    });
    expect(result.companies.map((c) => c.amount)).toEqual([200000, 50000]);
    expect(result.months).toHaveLength(12);
    expect(result.months.at(-1)).toEqual({
      month: "2026-09",
      amount: 250000,
      count: 3,
    });
    expect(result.months[0].amount).toBe(0);
    expect(
      summarizeSales(groups, companies, filters({ basis: "transfer" })).total,
    ).toBe(254580);
  });
  it("applies the company filter to current, previous and trend values", () => {
    expect(
      summarizeSales(groups, companies, filters({ companyId: "b" })),
    ).toMatchObject({
      total: 50000,
      previous: 0,
      change: null,
      companyCount: 1,
    });
    expect(
      summarizeSales(groups, companies, filters({ companyId: "unknown" })),
    ).toMatchObject({ total: 0, count: 0 });
  });
  it("compares the preceding equal-length period across year boundaries", () => {
    expect(filters({ fromMonth: "2026-01", toMonth: "2026-03" })).toMatchObject(
      { previousFrom: "2025-10", previousTo: "2025-12" },
    );
    expect(filters({ fromMonth: "2025-01", toMonth: "2026-12" })).toMatchObject(
      { previousFrom: "2023-01", queryFrom: "2023-01", trendFrom: "2025-01" },
    );
  });
  it.each([
    { fromMonth: "2026-13" },
    { fromMonth: "bad" },
    { fromMonth: "2027-01", toMonth: "2026-09" },
    { fromMonth: "2020-01", toMonth: "2026-09" },
    { fromMonth: "9999-12" },
  ])("handles malformed and excessive periods safely: %j", (sp) => {
    expect(filters(sp)).toMatchObject({
      from: "2026-09",
      to: "2026-09",
      error: expect.any(String),
    });
    expect(filters(sp).error).not.toBe("");
  });
  it("encodes drill-down values and includes inclusive start and exclusive end dates", () => {
    const href = invoiceSalesHref("2024-02", "2024-02", "a&status=DRAFT");
    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("status")).toBe("ISSUED");
    expect(params.get("companyId")).toBe("a&status=DRAFT");
    expect(
      invoiceDateFilter(params.get("fromMonth")!, params.get("toMonth")!),
    ).toEqual({ gte: new Date("2024-02-01"), lt: new Date("2024-03-01") });
    expect(invoiceDateFilter(undefined, "2026-12")).toEqual({
      lt: new Date("2027-01-01"),
    });
    expect(() => invoiceDateFilter("2026-13", "2026-01")).toThrow();
    expect(invoiceDateFilter()).toBeUndefined();
  });
});
