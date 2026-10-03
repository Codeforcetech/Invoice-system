import { z } from "zod";

export const invoiceItemInputSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(1, "商品名は必須です")
    .max(500, "品目は500文字以内で入力してください"),
  unit: z.string().max(20).optional().nullable(),
  quantity: z.coerce
    .number()
    .finite()
    .nonnegative("数量は0以上で入力してください")
    .max(99999999)
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.000001,
      "数量は小数点以下2桁までで入力してください",
    ),
  unitPrice: z.coerce
    .number()
    .int()
    .finite()
    .nonnegative("単価は0以上で入力してください")
    .max(1_000_000_000, "単価は10億円以下で入力してください"),
  amount: z.coerce
    .number()
    .int()
    .finite()
    .nonnegative("金額は0以上で入力してください")
    .max(1_000_000_000, "金額は10億円以下で入力してください"),
  amountManuallyEdited: z.coerce.boolean(),
  note: z
    .string()
    .max(1000, "明細備考は1,000文字以内で入力してください")
    .optional()
    .nullable(),
});

export const invoiceUpsertSchema = z
  .object({
    companyId: z.string().min(1, "会社は必須です"),
    subject: z
      .string()
      .trim()
      .min(1, "件名は必須です")
      .max(200, "件名は200文字以内で入力してください"),
    issueDate: z.coerce.date(),
    dueDate: z.coerce.date(),
    withholdingEnabled: z.coerce.boolean(),
    status: z.enum(["DRAFT", "CONFIRMED", "ISSUED"]),
    items: z
      .array(invoiceItemInputSchema)
      .min(1, "明細は1行以上必要です")
      .max(100, "明細は100行以内で入力してください"),
  })
  .superRefine((data, ctx) => {
    const subtotal = data.items.reduce(
      (sum, item) =>
        sum +
        (item.amountManuallyEdited
          ? item.amount
          : Math.floor(item.quantity * item.unitPrice)),
      0,
    );
    if (subtotal > 1_000_000_000)
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "税抜合計は10億円以下で入力してください",
      });
  });

export type InvoiceUpsertInput = z.infer<typeof invoiceUpsertSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;
