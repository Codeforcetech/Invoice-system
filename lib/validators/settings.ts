import { z } from "zod";
import { isEmbeddedStamp } from "@/lib/invoice/resolveStampImageUrl";
import { normalizeRegistrationNumber } from "@/lib/tax/registration-number";

/**
 * 登録番号は、空欄か「T＋13桁」だけ保存できる（全角・ハイフンなどは正規形にそろえる）。
 * 以前に保存された形式外の値は、変更しない限り保存を止めない（`legacyRegistrationNumber`）。
 */
export function createSettingsSchema(legacyRegistrationNumber?: string | null) {
  return z.object({
    companyName: z.string().trim().min(1, "自社名は必須です").max(200),
    invoiceRegistrationNumber: z
      .string()
      .max(2000)
      .optional()
      .nullable()
      .transform((v, ctx) => {
        const r = normalizeRegistrationNumber(v);
        if (r.ok) return r.value;
        if (v != null && v === legacyRegistrationNumber) return v;
        ctx.addIssue({
          code: "custom",
          message: "登録番号の形式を確認してください（「T」＋13桁の数字）。",
        });
        return z.NEVER;
      }),
    postalCode: z.string().max(2000).optional().nullable(),
    address: z.string().max(2000).optional().nullable(),
    phone: z.string().max(2000).optional().nullable(),
    email: z
      .string()
      .trim()
      .max(254)
      .refine(
        (v) => !v || z.email().safeParse(v).success,
        "送信元のメールアドレスを確認してください",
      )
      .optional()
      .nullable(),
    contactPerson: z.string().max(2000).optional().nullable(),
    stampImageUrl: z
      .string()
      .optional()
      .nullable()
      .refine(
        (v) => {
          if (v == null || v.trim() === "") return true;
          if (isEmbeddedStamp(v)) return true;
          try {
            const u = new URL(v.trim());
            return u.protocol === "https:" || u.protocol === "http:";
          } catch {
            return false;
          }
        },
        {
          message:
            "画像ファイル（PNG/JPEG）または正しい http(s) URLを指定してください",
        },
      ),
    bankName: z.string().max(2000).optional().nullable(),
    branchName: z.string().max(2000).optional().nullable(),
    accountType: z.string().max(2000).optional().nullable(),
    accountNumber: z.string().max(2000).optional().nullable(),
    accountHolder: z.string().max(2000).optional().nullable(),
    accountHolderKana: z.string().max(2000).optional().nullable(),
    transferNote: z.string().max(2000).optional().nullable(),
    taxRate: z.coerce
      .number()
      .int()
      .min(0, "消費税率は0以上で入力してください")
      .max(10000, "消費税率は100%以下で入力してください"), // bps（例:10%=>1000）
  });
}

export const settingsUpdateSchema = createSettingsSchema();
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
