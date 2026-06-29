import { prisma } from "@/lib/db/prisma";
import { generateShareToken } from "@/lib/invoice/generateShareToken";
import { getSystemSettingByUserId } from "@/lib/settings/system-setting";

const invoiceShareSelect = {
  id: true,
  invoiceNumber: true,
  subject: true,
  issueDate: true,
  dueDate: true,
  subtotal: true,
  taxRate: true,
  taxAmount: true,
  totalWithTax: true,
  withholdingEnabled: true,
  withholdingTax: true,
  grandTotal: true,
  status: true,
  createdAt: true,
  createdById: true,
  company: {
    select: {
      id: true,
      name: true,
      paymentTerms: true,
    },
  },
  items: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      sortOrder: true,
      productName: true,
      unit: true,
      quantity: true,
      unitPrice: true,
      amount: true,
      amountManuallyEdited: true,
      note: true,
    },
  },
} as const;

export type InvoiceForShare = NonNullable<
  Awaited<ReturnType<typeof getInvoiceByShareToken>>
>;

/** 共有トークンで請求書を取得（認証不要） */
export async function getInvoiceByShareToken(token: string) {
  const normalized = token.trim();
  if (!normalized) return null;

  return prisma.invoice.findFirst({
    where: { shareToken: normalized },
    select: invoiceShareSelect,
  });
}

/** 帳票表示用の自社設定（請求書作成者の設定） */
export async function getSystemSettingForShare(userId: string) {
  const settings = await getSystemSettingByUserId(userId);
  if (!settings) throw new Error("SYSTEM_SETTING_NOT_FOUND");
  return settings;
}

/** 請求書に共有トークンがなければ発行する（所有者のみ） */
export async function ensureInvoiceShareToken(params: { invoiceId: string; userId: string }) {
  const existing = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, createdById: params.userId },
    select: { shareToken: true },
  });
  if (!existing) throw new Error("FORBIDDEN_INVOICE");
  if (existing.shareToken) return existing.shareToken;

  for (let attempt = 0; attempt < 5; attempt++) {
    const shareToken = generateShareToken();
    try {
      const updated = await prisma.invoice.update({
        where: { id: params.invoiceId },
        data: { shareToken },
        select: { shareToken: true },
      });
      return updated.shareToken!;
    } catch {
      // 極めて稀なトークン衝突時は再試行
    }
  }
  throw new Error("SHARE_TOKEN_GENERATION_FAILED");
}
