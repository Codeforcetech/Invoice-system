import { it, expect } from "vitest";
import { renderAccountingPdf } from "@/lib/pdf/render-accounting";
import { writeFile, mkdir } from "node:fs/promises";
it("renders Japanese multi-page ledger PDF", async () => {
  const rows = Array.from({ length: 80 }, (_, i) => [
    "2026-09-27",
    `取引 ${i + 1} 長い摘要の日本語表示を確認します`,
    "売上高",
    11000,
    0,
    (i + 1) * 11000,
  ]);
  const pdf = await renderAccountingPdf(
    "総勘定元帳 / 普通預金",
    "2026-01-01 - 2026-09-27",
    ["日付", "摘要", "相手科目", "借方", "貸方", "残高"],
    rows,
  );
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(10000);
  if (process.env.SEIQ_PDF_QA) {
    await mkdir(process.env.SEIQ_PDF_QA, { recursive: true });
    await writeFile(`${process.env.SEIQ_PDF_QA}/accounting-ledger.pdf`, pdf);
  }
});
