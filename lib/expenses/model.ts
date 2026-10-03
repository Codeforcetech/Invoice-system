import { z } from "zod";
import { TAX_CATEGORIES } from "@/lib/tax/categories";
export const EXPENSE_CATEGORIES = [
  "外注費",
  "仕入",
  "家賃",
  "通信・サブスク",
  "広告宣伝",
  "交通費",
  "備品・消耗品",
  "その他",
] as const;
export const MAX_EXPENSE_PDF_BYTES = 3 * 1024 * 1024;
export function japanToday(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export const dateValue = (v: Date | string) =>
  typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10);
const day = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/, "日付を正しく入力してください")
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "存在する日付を入力してください");
export const expenseSchema = z.object({
  id: z.string().uuid(),
  version: z.string().max(40).optional(),
  supplier: z.string().trim().min(1, "支払先を入力してください").max(150),
  description: z.string().trim().min(1, "支払内容を入力してください").max(300),
  category: z.enum(EXPENSE_CATEGORIES),
  /** 課税仕入などの消費税区分。未設定（null）は区分を指定しない */
  taxCategory: z
    .preprocess((v) => (v === "" ? null : v), z.enum(TAX_CATEGORIES).nullable())
    .optional(),
  amount: z.coerce
    .number()
    .int("金額は整数で入力してください")
    .min(1, "金額は1円以上で入力してください")
    .max(2147483647, "金額が上限を超えています"),
  costMonth: z
    .string()
    .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "対象月を選択してください"),
  dueDate: day,
  paidDate: z
    .union([z.literal(""), day])
    .refine(
      (v) => !v || v <= japanToday(),
      "支払日は今日以前の日付を指定してください",
    ),
  note: z.string().trim().max(2000),
  removeAttachment: z.boolean().default(false),
});
export type ExpenseInput = z.input<typeof expenseSchema>;
export type ExpenseRow = {
  id: string;
  supplier: string;
  description: string;
  category: string;
  taxCategory?: string | null;
  amount: number;
  costMonth: string;
  dueDate: string;
  paidDate: string | null;
  note: string;
  version: string;
  filename: string | null;
};
export function expenseStatus(
  row: Pick<ExpenseRow, "paidDate" | "dueDate">,
  today = japanToday(),
) {
  return row.paidDate ? "PAID" : row.dueDate < today ? "OVERDUE" : "UNPAID";
}
export async function readExpensePdf(file: File | null) {
  if (!file || (!file.name && file.size === 0)) return null;
  if (file.size === 0) throw new Error("PDFファイルが空です。");
  if (file.size > MAX_EXPENSE_PDF_BYTES)
    throw new Error("PDFは3MB以内で添付してください。");
  if (
    !/\.pdf$/i.test(file.name) ||
    (file.type && file.type !== "application/pdf")
  )
    throw new Error("PDFファイルを選択してください。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (
    new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-" ||
    !new TextDecoder()
      .decode(bytes.subarray(Math.max(0, bytes.length - 1024)))
      .includes("%%EOF")
  )
    throw new Error(
      "PDFの形式を確認できません。別のファイルを選択してください。",
    );
  return {
    filename: file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 150),
    data: bytes,
  };
}
export function expenseSummary(
  rows: ExpenseRow[],
  from: string,
  to: string,
  today = japanToday(),
) {
  const inPeriod = rows.filter((r) => r.costMonth >= from && r.costMonth <= to);
  const dueSoon = new Date(`${today}T00:00:00Z`);
  dueSoon.setUTCDate(dueSoon.getUTCDate() + 7);
  const end = dueSoon.toISOString().slice(0, 10);
  const sum = (rs: ExpenseRow[]) => rs.reduce((v, r) => v + r.amount, 0);
  return {
    cost: sum(inPeriod),
    paid: sum(
      rows.filter(
        (r) =>
          r.paidDate &&
          r.paidDate.slice(0, 7) >= from &&
          r.paidDate.slice(0, 7) <= to,
      ),
    ),
    unpaid: sum(rows.filter((r) => !r.paidDate)),
    overdue: rows.filter((r) => expenseStatus(r, today) === "OVERDUE"),
    dueSoon: rows.filter(
      (r) => !r.paidDate && r.dueDate >= today && r.dueDate <= end,
    ),
    inPeriod,
  };
}
