import { z } from "zod";

export const itemTemplateUpsertSchema = z.object({
  name: z.string().min(1, "テンプレート名は必須です"),
  productName: z.string().min(1, "商品名は必須です"),
  unit: z.string().optional().nullable(),
  quantity: z.coerce.number().finite().nonnegative(),
  unitPrice: z.coerce.number().int().finite().nonnegative(),
  note: z.string().optional().nullable(),
});

export type ItemTemplateUpsertInput = z.infer<typeof itemTemplateUpsertSchema>;
