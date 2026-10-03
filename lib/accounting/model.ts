import { z } from "zod";
export const kinds = {
  ASSET: "資産",
  LIABILITY: "負債",
  EQUITY: "純資産",
  REVENUE: "収益",
  EXPENSE: "費用",
} as const;
export const daySchema = z
  .string()
  .regex(/^20\d{2}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "実在する日付を入力してください");
export const lineSchema = z
  .object({
    accountId: z.string().min(1),
    debit: z.coerce.number().int().min(0).max(2147483647),
    credit: z.coerce.number().int().min(0).max(2147483647),
  })
  .refine(
    (l) => l.debit > 0 !== l.credit > 0,
    "各行は借方か貸方のどちらか一方に正の金額を入力してください",
  );
export const journalSchema = z
  .object({
    requestKey: z.string().uuid(),
    date: daySchema,
    memo: z.string().trim().min(1).max(500),
    lines: z.array(lineSchema).min(2).max(100),
  })
  .superRefine((v, ctx) => {
    if (v.lines.reduce((s, l) => s + l.debit - l.credit, 0) !== 0)
      ctx.addIssue({
        code: "custom",
        message: "借方合計と貸方合計を一致させてください",
        path: ["lines"],
      });
  });
export type EntryInput = z.infer<typeof journalSchema>;
export type AccountRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  active: boolean;
  system: boolean;
};
export const debitNormal = (kind: string) =>
  kind === "ASSET" || kind === "EXPENSE";
export const yen = (n: number) => n.toLocaleString("ja-JP");
export const dateText = (d: Date | string) =>
  new Date(d).toISOString().slice(0, 10);
// Invoice dates are timestamps from the existing Japanese invoice editor.
// Accounting @db.Date fields continue to use dateText (UTC date-only).
export const invoiceDateText = (d: Date | string) =>
  new Date(new Date(d).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
export const baseAccounts = [
  ["100", "現金", "ASSET"],
  ["110", "普通預金", "ASSET"],
  ["120", "売掛金", "ASSET"],
  ["130", "仮払税金（源泉徴収）", "ASSET"],
  ["140", "前払金", "ASSET"],
  ["150", "備品", "ASSET"],
  ["200", "買掛金", "LIABILITY"],
  ["210", "未払金", "LIABILITY"],
  ["220", "借入金", "LIABILITY"],
  ["300", "元入金・資本金", "EQUITY"],
  ["400", "売上高", "REVENUE"],
  ["500", "仕入高", "EXPENSE"],
  ["510", "外注費", "EXPENSE"],
  ["520", "地代家賃", "EXPENSE"],
  ["530", "通信費", "EXPENSE"],
  ["540", "広告宣伝費", "EXPENSE"],
  ["550", "旅費交通費", "EXPENSE"],
  ["560", "消耗品費", "EXPENSE"],
  ["570", "支払手数料", "EXPENSE"],
  ["580", "雑費", "EXPENSE"],
] as const;
export const templates = {
  SERVICE: "サービス・IT",
  RETAIL: "小売・卸売",
  CONSTRUCTION: "建設・制作",
} as const;
export function templateAccounts(industry: string) {
  const extra: [string, string, string][] =
    industry === "RETAIL"
      ? [
          ["160", "商品", "ASSET"],
          ["590", "荷造運賃", "EXPENSE"],
        ]
      : industry === "CONSTRUCTION"
        ? [
            ["170", "未成工事支出金", "ASSET"],
            ["590", "材料費", "EXPENSE"],
          ]
        : [["590", "新聞図書費", "EXPENSE"]];
  return [...baseAccounts, ...extra].map(([code, name, kind]) => ({
    code,
    name,
    kind,
  }));
}
// Prevent spreadsheet applications from interpreting user text as formulas.
export function csvCell(value: string | number) {
  let s = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function csv(rows: (string | number)[][]) {
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}
