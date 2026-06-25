import { z } from "zod";

export const settingsUpdateSchema = z.object({
  companyName: z.string().min(1, "自社名は必須です"),
  invoiceRegistrationNumber: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  stampImageUrl: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
  accountType: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  accountHolder: z.string().optional().nullable(),
  accountHolderKana: z.string().optional().nullable(),
  transferNote: z.string().optional().nullable(),
  taxRate: z.coerce.number().int().min(0, "消費税率は0以上で入力してください"), // bps（例:10%=>1000）
});

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;

