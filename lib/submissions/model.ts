import { z } from "zod";
import {
  TAX_CATEGORIES,
  taxCategoryInfo,
  type TaxCategory,
} from "@/lib/tax/categories";
import { REWARD_CATEGORY } from "@/lib/expenses/model";

/**
 * 業務委託メンバー（提出者）が提出する、報酬の請求書。
 * 明細の金額は税抜で、税区分ごとに消費税を足す（請求書と同じ考え方）。
 * 交通費は、初期値を非課税にする（変更できる）。
 */
export const SUBMISSION_KINDS = ["REWARD", "TRANSPORT", "EXPENSE"] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];
export const submissionKindLabel: Record<SubmissionKind, string> = {
  REWARD: "報酬",
  TRANSPORT: "交通費",
  EXPENSE: "その他の経費",
};
export const defaultTaxFor: Record<SubmissionKind, TaxCategory> = {
  REWARD: "TAXABLE_10",
  TRANSPORT: "EXEMPT",
  EXPENSE: "TAXABLE_10",
};
/** 承認したとき、支払管理の費目になる名前 */
export const expenseCategoryFor: Record<SubmissionKind, string> = {
  REWARD: REWARD_CATEGORY,
  TRANSPORT: "交通費",
  EXPENSE: "その他",
};
export const submissionStatusLabel: Record<string, string> = {
  DRAFT: "下書き",
  SUBMITTED: "承認待ち",
  APPROVED: "承認済み",
  REJECTED: "差戻し",
};
export const MAX_SUBMISSION_ITEMS = 30;
export const MAX_SUBMISSION_FILES = 10;

const month = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "何月分かを選んでください");
export const itemSchema = z.object({
  kind: z.enum(SUBMISSION_KINDS),
  name: z.string().trim().min(1, "項目名を入力してください").max(100),
  quantity: z.coerce
    .number()
    .positive("数量は0より大きい数にしてください")
    .max(99999)
    .refine(
      (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,
      "数量は小数第2位までです",
    ),
  unitPrice: z.coerce
    .number()
    .int("単価は整数の円で入力してください")
    .min(0, "単価は0円以上にしてください")
    .max(100_000_000),
  taxCategory: z.enum(TAX_CATEGORIES),
  note: z.string().trim().max(200).default(""),
});
export type SubmissionItemInput = z.infer<typeof itemSchema>;

export const submissionSchema = z.object({
  id: z.string().uuid(),
  version: z.string().datetime().optional(),
  month,
  title: z.string().trim().min(1, "件名を入力してください").max(100),
  note: z.string().trim().max(1000).default(""),
  items: z
    .array(itemSchema)
    .min(1, "明細を1行以上入力してください")
    .max(MAX_SUBMISSION_ITEMS),
  /** 請求書のAI読み取りを使ったか、確認が必要だった点（承認する人への参考。画面の申告） */
  aiAssisted: z.boolean().default(false),
  aiNote: z.string().trim().max(500).default(""),
});
export type SubmissionInput = z.infer<typeof submissionSchema>;

/** 数量 × 単価（円未満は四捨五入） */
export const itemAmount = (quantity: number, unitPrice: number) =>
  Math.round((Math.round(quantity * 100) * unitPrice) / 100);

export type TaxGroup = {
  taxCategory: TaxCategory;
  net: number;
  tax: number;
};
/** 税区分ごとに税抜の合計を出し、課税のものだけ消費税を足す（円未満は切り捨て）。 */
export function taxGroups(
  items: { amount: number; taxCategory: string }[],
): TaxGroup[] {
  const map = new Map<TaxCategory, number>();
  for (const i of items) {
    const c = i.taxCategory as TaxCategory;
    map.set(c, (map.get(c) ?? 0) + i.amount);
  }
  return [...map.entries()].map(([taxCategory, net]) => {
    const info = taxCategoryInfo[taxCategory];
    return {
      taxCategory,
      net,
      tax: info.taxable ? Math.floor((net * info.rateBps) / 10000) : 0,
    };
  });
}

export function submissionTotals<
  T extends { quantity: number; unitPrice: number; taxCategory: string },
>(items: T[]) {
  const withAmount = items.map((i) => ({
    ...i,
    amount: itemAmount(i.quantity, i.unitPrice),
  }));
  const groups = taxGroups(withAmount);
  const subtotal = withAmount.reduce((n, i) => n + i.amount, 0);
  const taxAmount = groups.reduce((n, g) => n + g.tax, 0);
  return {
    items: withAmount,
    groups,
    subtotal,
    taxAmount,
    total: subtotal + taxAmount,
  };
}

/**
 * 承認したときに作る支払い（支払管理）の単位。
 * 「種類（報酬・交通費・経費）× 税区分」ごとに1件。金額は税込。
 */
export function expenseGroups(
  items: { kind: string; name: string; amount: number; taxCategory: string }[],
) {
  const map = new Map<
    string,
    {
      kind: SubmissionKind;
      taxCategory: TaxCategory;
      net: number;
      names: string[];
    }
  >();
  for (const i of items) {
    const key = `${i.kind}|${i.taxCategory}`;
    const g = map.get(key) ?? {
      kind: i.kind as SubmissionKind,
      taxCategory: i.taxCategory as TaxCategory,
      net: 0,
      names: [],
    };
    g.net += i.amount;
    g.names.push(i.name);
    map.set(key, g);
  }
  return [...map.values()].map((g) => {
    const info = taxCategoryInfo[g.taxCategory];
    const tax = info.taxable ? Math.floor((g.net * info.rateBps) / 10000) : 0;
    return {
      ...g,
      tax,
      gross: g.net + tax,
      category: expenseCategoryFor[g.kind],
    };
  });
}

/** 交通費・経費の明細があるときは、領収書が必要。 */
export const needsReceipt = (items: { kind: string }[]) =>
  items.some((i) => i.kind !== "REWARD");

export const profileSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(1, "お名前（会社名）を入力してください")
    .max(100),
  address: z.string().trim().max(200).default(""),
  phone: z.string().trim().max(30).default(""),
  registrationNumber: z
    .string()
    .trim()
    .max(14)
    .refine(
      (v) => v === "" || /^T\d{13}$/.test(v.normalize("NFKC")),
      "登録番号は「T」と13桁の数字です",
    )
    .default(""),
  bankName: z.string().trim().max(60).default(""),
  branchName: z.string().trim().max(60).default(""),
  accountType: z.string().trim().max(20).default(""),
  accountNumber: z.string().trim().max(20).default(""),
  accountHolder: z.string().trim().max(60).default(""),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const bankText = (p: ProfileInput) =>
  [p.bankName, p.branchName, p.accountType, p.accountNumber, p.accountHolder]
    .filter(Boolean)
    .join(" ");
