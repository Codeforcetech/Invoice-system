import { z } from "zod";
import { isEmbeddedStamp } from "@/lib/invoice/resolveStampImageUrl";

export const settingsUpdateSchema = z.object({
  companyName: z.string().trim().min(1, "自社名は必須です").max(200),
  invoiceRegistrationNumber: z.string().max(2000).optional().nullable(),
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

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
