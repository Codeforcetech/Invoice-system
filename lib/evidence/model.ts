import { z } from "zod";
import { daySchema } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";

export const EVIDENCE_KINDS = [
  "RECEIPT",
  "INVOICE",
  "QUOTE",
  "ORDER",
  "CONTRACT",
  "OTHER",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const evidenceKindLabel: Record<EvidenceKind, string> = {
  RECEIPT: "領収書",
  INVOICE: "請求書",
  QUOTE: "見積書",
  ORDER: "注文書・納品書",
  CONTRACT: "契約書",
  OTHER: "その他",
};
export const evidenceStatusLabel: Record<string, string> = {
  ACTIVE: "有効",
  VOID: "無効",
};

export const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;
export const EVIDENCE_PAGE_SIZE = 50;

export const RETENTION_NOTE =
  "法人は原則7年、欠損金の繰越控除を受ける場合は10年、帳簿書類を保存します。このファイルボックスの証憑は削除できません。保存要件への適合は、利用者ご自身（必要に応じて税理士）で確認してください。";

/** 検索用の取引先キー。全角半角・大小文字・空白の違いを吸収する。 */
export function counterpartyKey(name: string) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]+/g, "");
}

const optionalInt = (max = 2147483647) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(0).max(max).optional(),
  );

/** 登録・訂正で入力する、検索に使う3項目と種類・メモ。 */
export const evidenceMetaSchema = z.object({
  kind: z.enum(EVIDENCE_KINDS, { error: "証憑の種類を選択してください" }),
  transactionDate: daySchema.refine(
    (d) => d <= japanToday(),
    "取引年月日は今日以前にしてください",
  ),
  amount: z.coerce
    .number({ error: "金額を入力してください" })
    .int("金額は整数の円で入力してください")
    .min(0, "金額は0円以上で入力してください")
    .max(2147483647, "金額が上限を超えています"),
  counterparty: z.string().trim().min(1, "取引先を入力してください").max(150),
  memo: z.string().trim().max(1000).default(""),
});
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;

export const evidenceSearchSchema = z.object({
  from: z.preprocess((v) => (v === "" ? undefined : v), daySchema.optional()),
  to: z.preprocess((v) => (v === "" ? undefined : v), daySchema.optional()),
  amountMin: optionalInt(),
  amountMax: optionalInt(),
  counterparty: z.string().trim().max(150).default(""),
  kind: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(EVIDENCE_KINDS).optional(),
  ),
  status: z.enum(["ACTIVE", "VOID", "ALL"]).default("ACTIVE"),
  page: z
    .preprocess(
      (v) => (v === "" || v == null ? 1 : v),
      z.coerce.number().int().min(1).max(10000),
    )
    .default(1),
});
export type EvidenceSearch = z.infer<typeof evidenceSearchSchema>;
