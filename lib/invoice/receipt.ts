import { z } from "zod";
import { japanToday, dateValue } from "@/lib/expenses/model";
export const receiptSchema = z.object({
  invoiceId: z.string().min(1).max(100),
  version: z.string().datetime(),
  receivedDate: z.union([
    z.literal(""),
    z
      .string()
      .regex(/^20\d{2}-\d{2}-\d{2}$/)
      .refine((v) => {
        const d = new Date(v);
        return !isNaN(+d) && dateValue(d) === v && v <= japanToday();
      }, "入金日は今日以前の実在する日付を指定してください"),
  ]),
});
export function receiptLabel(
  status: string,
  receivedDate: Date | string | null,
  dueDate: Date | string,
  today = japanToday(),
) {
  if (status !== "ISSUED") return "発行前";
  if (receivedDate) return "入金済み";
  return dateValue(dueDate) < today ? "期限超過・未確認" : "未入金・未確認";
}
