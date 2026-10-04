import { z } from "zod";
import { daySchema } from "@/lib/accounting/model";
import { RECEIPT_CATEGORIES, japanToday } from "@/lib/expenses/model";
export const claimStatus: Record<string, string> = {
  DRAFT: "下書き",
  PENDING: "承認待ち",
  APPROVED: "承認済み・未精算",
  REJECTED: "差戻し",
  PAID: "精算済み",
};
export const claimSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().min(1).max(100),
  version: z.string().datetime().optional(),
  title: z.string().trim().min(1, "件名を入力してください").max(150),
  merchant: z.string().trim().min(1, "支払先を入力してください").max(150),
  date: daySchema.refine(
    (d) => d <= japanToday(),
    "経費の日付は今日以前にしてください",
  ),
  amount: z.coerce.number().int().min(1).max(2147483647),
  category: z.enum(RECEIPT_CATEGORIES),
  note: z.string().trim().max(2000),
  removeReceipt: z.boolean().default(false),
});
export const categoryAccount: Record<string, string> = {
  外注費: "510",
  仕入: "500",
  家賃: "520",
  "通信・サブスク": "530",
  広告宣伝: "540",
  交通費: "550",
  "備品・消耗品": "560",
  その他: "580",
};
export const claimActions: Record<string, string> = {
  SAVE: "下書き保存",
  SUBMIT: "申請",
  WITHDRAW: "取下げ",
  APPROVE: "承認",
  REJECT: "差戻し",
  REVOKE: "承認取消",
  PAY: "精算記録",
  UNDO_PAY: "精算取消",
};
