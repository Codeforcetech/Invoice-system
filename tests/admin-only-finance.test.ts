import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { navigation } from "../src/components/app-shell/app-sidebar";
import { resolveSalesFilters, summarizeSales } from "../lib/dashboard/sales";
import { DashboardView } from "../src/components/dashboard/dashboard-view";

/**
 * 経営レポート・売上・損益の画面と出力は、管理者だけ。提出者やほかのメンバーには見せない。
 * 画面と出力の入口で、管理者の確認が外れていないことを確かめる。
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("finance views are admin-only", () => {
  it("pages require the admin role", () => {
    for (const p of [
      "src/app/(app)/reports/page.tsx",
      "src/app/(app)/accounting/monthly/page.tsx",
      "src/app/(app)/accounting/sales-table/page.tsx",
      "src/app/(app)/accounting/sales-table/detail/page.tsx",
    ])
      expect(read(p), p).toContain('requireWorkspacePage("ADMIN")');
  });

  it("exports require the admin role before reading any data", () => {
    for (const p of [
      "src/app/api/reports/export/route.ts",
      "src/app/api/accounting/monthly-csv/route.ts",
      "src/app/api/accounting/sales-table-csv/route.ts",
    ]) {
      const src = read(p);
      const guard = src.indexOf('hasRole(ws.role, "ADMIN")');
      expect(guard, p).toBeGreaterThan(0);
      // 権限の確認は、データを読む処理より前にある
      for (const reader of [
        "managementReport(",
        "monthlyRows(",
        "salesTableLines(",
      ])
        if (src.includes(reader))
          expect(guard, `${p} ${reader}`).toBeLessThan(src.indexOf(reader));
    }
  });

  it("the sidebar shows the sales table only when asked to", () => {
    expect(navigation.some((n) => n.href === "/accounting/sales-table")).toBe(
      true,
    );
    expect(read("src/components/app-shell/app-sidebar.tsx")).toContain(
      'props.finance !== false || n.href !== "/accounting/sales-table"',
    );
  });

  it("the dashboard hides sales, payments and reports from non-admins", () => {
    const filters = resolveSalesFilters({});
    const data = {
      name: "山田",
      costs: {
        month: filters.current,
        total: 123456,
        paid: 0,
        overdueCount: 0,
        dueSoonCount: 0,
      },
      companyCount: 0,
      companies: [],
      filters,
      sales: summarizeSales([], [], filters),
      confirmedCount: 0,
      invoiceCount: 0,
      draftCount: 0,
      recent: [],
      setup: { company: true, bank: true, email: true },
    };
    const html = (finance: boolean) =>
      renderToStaticMarkup(
        createElement(DashboardView, {
          data,
          finance,
          reports: createElement("section", null, "経営レポートの中身"),
        }),
      );
    expect(html(false)).not.toContain("支払いの確認");
    expect(html(false)).not.toContain("経営レポートの中身");
    expect(html(false)).toContain("次にすること");
    expect(html(true)).toContain("経営レポートの中身");
    expect(html(true)).toContain("支払いの確認");
  });
});
