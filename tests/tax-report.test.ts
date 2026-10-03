import { describe, expect, it } from "vitest";
import {
  backOutTax,
  buildTaxRows,
  taxReportHeaders,
  taxReportPdfWidths,
} from "@/lib/accounting/tax-report";

const g = (
  kind: string,
  taxCategory: string | null,
  debit: number,
  credit: number,
) => ({
  kind,
  taxCategory,
  debit,
  credit,
});
const row = (rows: (string | number)[][], side: string, label: string) =>
  rows.find((r) => r[0] === side && r[1] === label);

describe("backing tax out of a tax-included amount", () => {
  it("uses rate / (100% + rate) and rounds down", () => {
    expect(backOutTax(11000, 1000)).toBe(1000);
    expect(backOutTax(1101, 1000)).toBe(100); // 100.09
    expect(backOutTax(1078, 800)).toBe(79); // 79.85
    expect(backOutTax(5000, 0)).toBe(0);
  });

  it("keeps the sign for returns and reversals", () => {
    expect(backOutTax(-11000, 1000)).toBe(-1000);
    expect(backOutTax(-1101, 1000)).toBe(-100);
  });
});

describe("tax category summary", () => {
  it("splits sales by category and backs out tax per category", () => {
    const rows = buildTaxRows([
      g("REVENUE", "TAXABLE_10", 0, 11000),
      g("REVENUE", "TAXABLE_8", 0, 1080),
      g("REVENUE", "EXEMPT", 0, 500),
    ]);
    expect(row(rows, "売上", "課税（10%）")).toEqual([
      "売上",
      "課税（10%）",
      11000,
      10000,
      1000,
    ]);
    expect(row(rows, "売上", "課税（軽減8%）")).toEqual([
      "売上",
      "課税（軽減8%）",
      1080,
      1000,
      80,
    ]);
    expect(row(rows, "売上", "非課税")).toEqual([
      "売上",
      "非課税",
      500,
      500,
      0,
    ]);
    expect(row(rows, "売上", "区分ありの合計")).toEqual([
      "売上",
      "区分ありの合計",
      12580,
      11500,
      1080,
    ]);
  });

  it("nets debits and credits, so a reversal cancels the original", () => {
    const rows = buildTaxRows([
      g("REVENUE", "TAXABLE_10", 0, 11000),
      g("REVENUE", "TAXABLE_10", 11000, 0),
    ]);
    expect(row(rows, "売上", "課税（10%）")).toEqual([
      "売上",
      "課税（10%）",
      0,
      0,
      0,
    ]);
  });

  it("counts expenses and tagged assets as purchases", () => {
    const rows = buildTaxRows([
      g("EXPENSE", "TAXABLE_10", 5500, 0),
      g("ASSET", "TAXABLE_10", 110000, 0),
      g("EXPENSE", "TAXABLE_8", 540, 0),
    ]);
    expect(row(rows, "仕入・経費", "課税（10%）")).toEqual([
      "仕入・経費",
      "課税（10%）",
      115500,
      105000,
      10500,
    ]);
    expect(row(rows, "仕入・経費", "課税（軽減8%）")).toEqual([
      "仕入・経費",
      "課税（軽減8%）",
      540,
      500,
      40,
    ]);
  });

  it("does not count bank, receivable or payable lines, and never guesses a category", () => {
    const rows = buildTaxRows([
      g("ASSET", null, 11000, 0), // accounts receivable / bank
      g("LIABILITY", null, 0, 5500),
      g("LIABILITY", "TAXABLE_10", 0, 5500),
      g("EQUITY", "TAXABLE_10", 0, 1),
    ]);
    expect(row(rows, "売上", "区分ありの合計")).toEqual([
      "売上",
      "区分ありの合計",
      0,
      0,
      0,
    ]);
    expect(row(rows, "仕入・経費", "区分ありの合計")).toEqual([
      "仕入・経費",
      "区分ありの合計",
      0,
      0,
      0,
    ]);
    expect(row(rows, "売上", "未設定（区分を指定していない取引）")?.[2]).toBe(
      0,
    );
  });

  it("shows revenue and expense lines without a category as unset, separately", () => {
    const rows = buildTaxRows([
      g("REVENUE", null, 0, 33000),
      g("REVENUE", "TAXABLE_10", 0, 11000),
      g("EXPENSE", null, 2200, 0),
      g("REVENUE", "TAXABLE_5", 0, 100), // unknown value is treated as unset
    ]);
    expect(row(rows, "売上", "未設定（区分を指定していない取引）")?.[2]).toBe(
      33100,
    );
    expect(row(rows, "売上", "区分ありの合計")?.[2]).toBe(11000);
    expect(
      row(rows, "仕入・経費", "未設定（区分を指定していない取引）")?.[2],
    ).toBe(2200);
  });

  it("always ends with the explanatory note and keeps every row the same width", () => {
    const rows = buildTaxRows([]);
    expect(rows.at(-1)?.[0]).toBe("注");
    expect(String(rows.at(-1)?.[1])).toContain("参考値");
    expect(new Set(rows.map((r) => r.length))).toEqual(new Set([5]));
  });
});

describe("tax summary exports", () => {
  it("renders the summary as a PDF, including the long note", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const { renderAccountingPdf } = await import("@/lib/pdf/render-accounting");
    const rows = buildTaxRows([
      g("REVENUE", "TAXABLE_10", 0, 1210000),
      g("REVENUE", "TAXABLE_8", 0, 54000),
      g("REVENUE", "EXEMPT", 0, 30000),
      g("REVENUE", null, 0, 88000),
      g("EXPENSE", "TAXABLE_10", 330000, 0),
      g("ASSET", "TAXABLE_10", 220000, 0),
      g("EXPENSE", null, 11000, 0),
    ]);
    const pdf = await renderAccountingPdf(
      "消費税区分別集計",
      "2026-01-01 - 2026-12-31",
      taxReportHeaders,
      rows,
      { widths: taxReportPdfWidths },
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const folder = path.resolve("../work/pdf");
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, "tax-summary.pdf"), pdf);
  });
});
