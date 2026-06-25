import { z } from "zod";

export const companyUpsertSchema = z.object({
  name: z.string().min(1, "会社名は必須です"),
  invoiceCode: z
    .string()
    .min(1, "会社コードは必須です")
    .regex(/^[A-Z0-9]+$/, "会社コードは英大文字/数字のみで入力してください"),
  defaultDueDays: z.coerce.number().int().min(1).max(365).default(30),
  paymentTerms: z.string().optional().nullable(),
  commonSubject: z.string().optional().nullable(),
  billingEmail: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || v === "" || z.string().email().safeParse(v).success, {
      message: "メール形式で入力してください",
    }),
  billingCcEmail: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || v === "" || z.string().email().safeParse(v).success, {
      message: "メール形式で入力してください",
    }),
});

export type CompanyUpsertInput = z.infer<typeof companyUpsertSchema>;
