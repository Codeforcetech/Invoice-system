import { expect, it } from "vitest";
import {
  expenseSchema,
  expenseSummary,
  expenseStatus,
  japanToday,
  readExpensePdf,
  MAX_EXPENSE_PDF_BYTES,
  type ExpenseRow,
} from "@/lib/expenses/model";
const input = {
  id: "11111111-1111-4111-8111-111111111111",
  supplier: "制作会社",
  description: "9月制作費",
  category: "外注費",
  amount: 110000,
  costMonth: "2026-09",
  dueDate: "2026-10-31",
  paidDate: "",
  note: "",
};
it("separates cost month and actual payment month", () => {
  const row: ExpenseRow = {
    ...input,
    paidDate: "2026-10-01",
    version: "v",
    filename: null,
  };
  expect(
    expenseSummary([row], "2026-09", "2026-09", "2026-10-02"),
  ).toMatchObject({ cost: 110000, paid: 0, unpaid: 0 });
  expect(
    expenseSummary([row], "2026-10", "2026-10", "2026-10-02"),
  ).toMatchObject({ cost: 0, paid: 110000 });
});
it("overdue and upcoming payments include other cost months, never paid items", () => {
  const base = { ...input, version: "v", filename: null };
  const rows: ExpenseRow[] = [
    { ...base, paidDate: null, dueDate: "2026-09-16", costMonth: "2026-08" },
    { ...base, id: "b", paidDate: null, dueDate: "2026-09-17" },
    { ...base, id: "c", paidDate: null, dueDate: "2026-09-24" },
    { ...base, id: "d", paidDate: null, dueDate: "2026-09-25" },
    { ...base, id: "e", paidDate: "2026-09-15", dueDate: "2026-09-10" },
  ];
  const s = expenseSummary(rows, "2026-09", "2026-09", "2026-09-17");
  expect(s.overdue).toHaveLength(1);
  expect(s.dueSoon.map((r) => r.id)).toEqual(["b", "c"]);
  expect(s.unpaid).toBe(440000);
  expect(expenseStatus(rows[4], "2026-09-17")).toBe("PAID");
});
it.each([
  { amount: -1 },
  { amount: 0 },
  { amount: 1.5 },
  { amount: 2147483648 },
  { amount: "" },
  { dueDate: "2026-02-30" },
  { costMonth: "2026-13" },
  { paidDate: "2099-01-01" },
  { supplier: " " },
  { category: "unknown" },
])("rejects invalid payment input: %j", (patch) =>
  expect(expenseSchema.safeParse({ ...input, ...patch }).success).toBe(false),
);
it("uses Japan date at midnight and accepts leap days", () => {
  expect(japanToday(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01");
  expect(
    expenseSchema.safeParse({ ...input, dueDate: "2028-02-29" }).success,
  ).toBe(true);
});
it("validates attachment signature, file size and extension", async () => {
  await expect(
    readExpensePdf(
      new File(["not PDF"], "bad.pdf", { type: "application/pdf" }),
    ),
  ).rejects.toThrow("形式");
  await expect(
    readExpensePdf(
      new File(["%PDF-1.7\n%%EOF"], "bad.html", { type: "text/html" }),
    ),
  ).rejects.toThrow("PDFファイル");
  await expect(
    readExpensePdf(
      new File([new Uint8Array(MAX_EXPENSE_PDF_BYTES + 1)], "big.pdf"),
    ),
  ).rejects.toThrow("3MB");
  const r = await readExpensePdf(
    new File(["%PDF-1.7\n%%EOF"], "請求書.pdf", { type: "application/pdf" }),
  );
  expect(r?.filename).toBe("請求書.pdf");
  expect(await readExpensePdf(null)).toBeNull();
});
