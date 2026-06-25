import { z } from "zod";

export const invoiceItemInputSchema = z.object({
  productName: z.string().min(1, "商品名は必須です"),
  unit: z.string().optional().nullable(),
  quantity: z.coerce.number().finite().nonnegative("数量は0以上で入力してください"),
  unitPrice: z.coerce.number().int().finite().nonnegative("単価は0以上で入力してください"),
  amount: z.coerce.number().int().finite().nonnegative("金額は0以上で入力してください"),
  amountManuallyEdited: z.coerce.boolean(),
  note: z.string().optional().nullable(),
});

export const invoiceUpsertSchema = z.object({
  companyId: z.string().min(1, "会社は必須です"),
  subject: z.string().min(1, "件名は必須です"),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  withholdingEnabled: z.coerce.boolean(),
  status: z.enum(["DRAFT", "CONFIRMED", "ISSUED"]),
  items: z.array(invoiceItemInputSchema).min(1, "明細は1行以上必要です"),
});

export type InvoiceUpsertInput = z.infer<typeof invoiceUpsertSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

