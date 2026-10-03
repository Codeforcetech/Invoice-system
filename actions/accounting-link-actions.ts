"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { accountingLock, type Tx } from "@/lib/accounting/service";
import { syncInvoice, syncExpense } from "@/lib/accounting/sync";
import { daySchema, dateText, invoiceDateText } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import { calculateInvoice } from "@/lib/invoice/calculateInvoice";
import { generateInvoiceNumber } from "@/lib/invoice/generateInvoiceNumber";
import { generateShareToken } from "@/lib/invoice/generateShareToken";
import {
  invoiceUpsertSchema,
  type InvoiceUpsertInput,
} from "@/lib/validators/invoice";
import { Prisma } from "@prisma/client";
function refresh() {
  for (const p of ["/accounting", "/invoices", "/expenses", "/dashboard"])
    revalidatePath(p, "layout");
}
async function ready(tx: Tx, userId: string) {
  if (!(await tx.accountingSetting.findUnique({ where: { userId } })))
    throw new Error("会計の初期設定を行ってください。");
}
export async function importAccountingSource(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const v = z
    .object({
      type: z.enum(["invoice", "expense"]),
      id: z.string(),
      version: z.string().datetime(),
    })
    .parse(raw);
  await prisma.$transaction(async (tx) => {
    await accountingLock(tx, ws.ownerId);
    await ready(tx, ws.ownerId);
    if (v.type === "invoice") {
      if (
        !(await tx.invoice.findFirst({
          where: {
            id: v.id,
            createdById: ws.ownerId,
            updatedAt: new Date(v.version),
            status: "ISSUED",
            mergedIntoId: null,
          },
        }))
      )
        throw new Error("請求書が更新されました。再読み込みしてください。");
      await syncInvoice(tx, ws.ownerId, v.id);
      await recordAudit(tx, ws, { action: "SOURCE_IMPORT", entity: "INVOICE", entityId: v.id, summary: "請求書を会計へ連携" });
    } else {
      if (
        !(await tx.expense.findFirst({
          where: { id: v.id, userId: ws.ownerId, updatedAt: new Date(v.version) },
        }))
      )
        throw new Error("支払いが更新されました。再読み込みしてください。");
      await syncExpense(tx, ws.ownerId, v.id);
      await recordAudit(tx, ws, { action: "SOURCE_IMPORT", entity: "PAYMENT", entityId: v.id, summary: "支払いを会計へ連携" });
    }
  });
  refresh();
}
const selection = z
  .array(z.object({ id: z.string(), version: z.string().datetime() }))
  .min(1)
  .max(50)
  .refine(
    (xs) => new Set(xs.map((x) => x.id)).size === xs.length,
    "同じ請求書は一度だけ選んでください",
  );
export async function matchReceipt(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const v = z
    .object({
      id: z.string().uuid(),
      date: daySchema.refine(
        (d) => d <= japanToday(),
        "未来の入金日は登録できません",
      ),
      amount: z.coerce.number().int().positive().max(2147483647),
      payer: z.string().trim().min(1).max(150),
      invoices: selection,
    })
    .parse(raw);
  await prisma.$transaction(
    async (tx) => {
      await accountingLock(tx, ws.ownerId);
      await ready(tx, ws.ownerId);
      const prior = await tx.receiptMatch.findUnique({ where: { id: v.id } });
      if (prior) {
        if (prior.userId !== ws.ownerId || prior.cancelledAt)
          throw new Error("この消込は利用できません。");
        if (
          prior.amount !== v.amount ||
          dateText(prior.date) !== v.date ||
          prior.payer !== v.payer ||
          JSON.stringify(prior.invoiceIds) !==
            JSON.stringify(v.invoices.map((i) => i.id))
        )
          throw new Error(
            "入力内容が変わっています。画面を開き直してください。",
          );
        return;
      }
      const invoices = await tx.invoice.findMany({
        where: {
          id: { in: v.invoices.map((i) => i.id) },
          createdById: ws.ownerId,
          status: "ISSUED",
          receivedDate: null,
          receiptMatchId: null,
          mergedIntoId: null,
        },
      });
      if (
        invoices.length !== v.invoices.length ||
        invoices.some(
          (i) =>
            v.invoices.find((x) => x.id === i.id)?.version !==
            i.updatedAt.toISOString(),
        )
      )
        throw new Error(
          "請求書が更新されたか、すでに入金済みです。再読み込みしてください。",
        );
      if (new Set(invoices.map((i) => i.companyId)).size !== 1)
        throw new Error("同じ取引先の請求書を選択してください。");
      if (invoices.reduce((s, i) => s + i.grandTotal, 0) !== v.amount)
        throw new Error("入金額と選択した請求書の振込請求額が一致しません。");
      const setting = await tx.accountingSetting.findUniqueOrThrow({
        where: { userId: ws.ownerId },
      });
      if (
        invoices.some(
          (i) => invoiceDateText(i.issueDate) < dateText(setting.startDate),
        )
      )
        throw new Error(
          "開始日前の請求書は対象外です。開始残高を確認してください。",
        );
      await tx.receiptMatch.create({
        data: {
          id: v.id,
          userId: ws.ownerId,
          date: new Date(v.date),
          amount: v.amount,
          payer: v.payer,
          invoiceIds: v.invoices.map((i) => i.id),
        },
      });
      for (const i of invoices) {
        await tx.invoice.update({
          where: { id: i.id },
          data: { receivedDate: new Date(v.date), receiptMatchId: v.id },
        });
        await syncInvoice(tx, ws.ownerId, i.id);
      }
      await recordAudit(tx, ws, {
        action: "RECEIPT_MATCH",
        entity: "RECEIPT",
        entityId: v.id,
        summary: `入金消込（${v.date}）請求書${invoices.length}件`,
      });
    },
    { timeout: 20000 },
  );
  refresh();
}
export async function cancelReceiptMatch(id: string) {
  const ws = await requireWorkspace("APPROVER");
  await prisma.$transaction(
    async (tx) => {
      await accountingLock(tx, ws.ownerId);
      const m = await tx.receiptMatch.findFirst({
        where: { id, userId: ws.ownerId },
      });
      if (!m) throw new Error("消込が見つかりません。");
      if (m.cancelledAt) return;
      const invoices = await tx.invoice.findMany({
        where: { createdById: ws.ownerId, receiptMatchId: m.id },
      });
      for (const i of invoices) {
        await tx.invoice.update({
          where: { id: i.id },
          data: { receivedDate: null, receiptMatchId: null },
        });
        await syncInvoice(tx, ws.ownerId, i.id);
      }
      await tx.receiptMatch.update({
        where: { id: m.id },
        data: { cancelledAt: new Date() },
      });
      await recordAudit(tx, ws, {
        action: "RECEIPT_CANCEL",
        entity: "RECEIPT",
        entityId: m.id,
        summary: `入金消込を取消（請求書${invoices.length}件）`,
      });
    },
    { timeout: 20000 },
  );
  refresh();
}
async function createDraft(
  tx: Tx,
  userId: string,
  input: InvoiceUpsertInput,
  taxRate: number,
  recurringKey?: string,
) {
  if (!(await tx.company.findFirst({ where: { id: input.companyId, userId } })))
    throw new Error("取引先が見つかりません。");
  const calc = calculateInvoice({
    items: input.items,
    taxRateBps: taxRate,
    withholdingEnabled: input.withholdingEnabled,
  });
  const invoiceNumber = await generateInvoiceNumber({
    prisma: tx,
    currentUserId: userId,
    companyId: input.companyId,
    issueDate: input.issueDate,
  });
  return tx.invoice.create({
    data: {
      invoiceNumber,
      createdById: userId,
      companyId: input.companyId,
      subject: input.subject,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      taxRate,
      ...calc,
      withholdingEnabled: input.withholdingEnabled,
      status: "DRAFT",
      shareToken: generateShareToken(),
      recurringKey,
      items: {
        create: input.items.map((i, n) => ({
          sortOrder: n + 1,
          productName: i.productName,
          unit: i.unit,
          quantity: new Prisma.Decimal(i.quantity.toFixed(2)),
          unitPrice: i.unitPrice,
          amount: i.amountManuallyEdited
            ? i.amount
            : Math.floor(i.quantity * i.unitPrice),
          amountManuallyEdited: i.amountManuallyEdited,
          note: i.note,
        })),
      },
    },
    select: { id: true },
  });
}
export async function combineInvoices(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const v = z
    .object({
      requestKey: z.string().uuid(),
      invoices: selection.refine(
        (xs) => xs.length >= 2,
        "2件以上を選択してください",
      ),
      date: daySchema,
      dueDate: daySchema,
      subject: z.string().trim().min(1).max(200),
    })
    .parse(raw);
  const result = await prisma.$transaction(
    async (tx) => {
      await accountingLock(tx, ws.ownerId);
      await ready(tx, ws.ownerId);
      const key = `combine:${ws.ownerId}:${v.requestKey}`;
      const prior = await tx.invoice.findUnique({
        where: { recurringKey: key },
      });
      if (prior) {
        const originals = await tx.invoice.findMany({
          where: { createdById: ws.ownerId, mergedIntoId: prior.id },
          select: { id: true },
        });
        if (
          prior.subject !== v.subject ||
          invoiceDateText(prior.issueDate) !== v.date ||
          invoiceDateText(prior.dueDate) !== v.dueDate ||
          originals.length !== v.invoices.length ||
          originals.some((o) => !v.invoices.some((i) => i.id === o.id))
        )
          throw new Error(
            "入力内容が変わっています。画面を開き直してください。",
          );
        return { id: prior.id };
      }
      const rows = await tx.invoice.findMany({
        where: {
          id: { in: v.invoices.map((i) => i.id) },
          createdById: ws.ownerId,
          status: "DRAFT",
          mergedIntoId: null,
          receivedDate: null,
        },
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { invoiceNumber: "asc" },
      });
      if (
        rows.length !== v.invoices.length ||
        rows.some(
          (i) =>
            v.invoices.find((x) => x.id === i.id)?.version !==
            i.updatedAt.toISOString(),
        )
      )
        throw new Error("未発行の最新の下書きだけを選択してください。");
      const first = rows[0];
      if (
        rows.some(
          (i) =>
            i.companyId !== first.companyId ||
            i.taxRate !== first.taxRate ||
            i.withholdingEnabled !== first.withholdingEnabled,
        )
      )
        throw new Error(
          "取引先・税率・源泉徴収の設定が同じ下書きを選択してください。",
        );
      const input = invoiceUpsertSchema.parse({
        companyId: first.companyId,
        subject: v.subject,
        issueDate: v.date,
        dueDate: v.dueDate,
        status: "DRAFT",
        withholdingEnabled: first.withholdingEnabled,
        items: rows.flatMap((r) =>
          r.items.map((i) => ({
            ...i,
            quantity: Number(i.quantity),
            note: [r.invoiceNumber, i.note].filter(Boolean).join(" / "),
          })),
        ),
      });
      const created = await createDraft(tx, ws.ownerId, input, first.taxRate, key);
      await tx.invoice.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, createdById: ws.ownerId },
        data: { mergedIntoId: created.id },
      });
      await recordAudit(tx, ws, {
        action: "INVOICE_COMBINE",
        entity: "INVOICE",
        entityId: created.id,
        summary: `請求書${rows.length}件を合算して下書きを作成`,
      });
      return created;
    },
    { timeout: 20000 },
  );
  refresh();
  return result;
}
export async function createRecurringInvoice(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const v = z
    .object({
      id: z.string().uuid(),
      sourceId: z.string(),
      version: z.string().datetime(),
      name: z.string().trim().min(1).max(100),
      nextMonth: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
      issueDay: z.coerce.number().int().min(1).max(31),
      dueDays: z.coerce.number().int().min(0).max(365),
    })
    .parse(raw);
  await prisma.$transaction(async (tx) => {
    await accountingLock(tx, ws.ownerId);
    await ready(tx, ws.ownerId);
    const inv = await tx.invoice.findFirst({
      where: {
        id: v.sourceId,
        createdById: ws.ownerId,
        updatedAt: new Date(v.version),
        mergedIntoId: null,
      },
      include: { items: true },
    });
    if (!inv)
      throw new Error("元の請求書が更新されました。再読み込みしてください。");
    const snapshot = {
      companyId: inv.companyId,
      subject: inv.subject,
      withholdingEnabled: inv.withholdingEnabled,
      taxRate: inv.taxRate,
      items: inv.items.map((i) => ({
        productName: i.productName,
        unit: i.unit,
        quantity: Number(i.quantity),
        unitPrice: i.unitPrice,
        amount: i.amount,
        amountManuallyEdited: i.amountManuallyEdited,
        note: i.note,
      })),
    };
    const prior = await tx.recurringInvoice.findUnique({ where: { id: v.id } });
    if (prior) {
      if (prior.userId !== ws.ownerId) throw new Error("定期請求を登録できません。");
      return;
    }
    await tx.recurringInvoice.create({
      data: {
        id: v.id,
        userId: ws.ownerId,
        companyId: inv.companyId,
        name: v.name,
        snapshot,
        nextMonth: v.nextMonth,
        issueDay: v.issueDay,
        dueDays: v.dueDays,
      },
    });
    await recordAudit(tx, ws, { action: "RECURRING_CREATE", entity: "INVOICE", entityId: v.id, summary: `定期請求「${v.name.slice(0, 60)}」を登録` });
  });
  refresh();
}
export async function setRecurringActive(id: string, active: boolean) {
  const ws = await requireWorkspace("EDITOR");
  if (typeof active !== "boolean")
    throw new Error("入力内容を確認してください。");
  await prisma.$transaction(async (tx) => {
    await accountingLock(tx, ws.ownerId);
    const r = await tx.recurringInvoice.updateMany({
      where: { id, userId: ws.ownerId },
      data: { active },
    });
    if (!r.count) throw new Error("定期請求が見つかりません。");
    await recordAudit(tx, ws, { action: active ? "RECURRING_RESUME" : "RECURRING_STOP", entity: "INVOICE", entityId: id, summary: `定期請求を${active ? "再開" : "停止"}` });
  });
  refresh();
}
export async function generateRecurringInvoice(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const v = z
    .object({
      id: z.string(),
      month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
    })
    .parse(raw);
  const result = await prisma.$transaction(
    async (tx) => {
      await accountingLock(tx, ws.ownerId);
      await ready(tx, ws.ownerId);
      const rule = await tx.recurringInvoice.findFirst({
        where: { id: v.id, userId: ws.ownerId },
      });
      if (!rule) throw new Error("定期請求が見つかりません。");
      const key = `recurring:${rule.id}:${v.month}`;
      const existing = await tx.invoice.findUnique({
        where: { recurringKey: key },
      });
      if (existing) return { id: existing.id };
      if (
        !rule.active ||
        rule.nextMonth !== v.month ||
        v.month > japanToday().slice(0, 7)
      )
        throw new Error("この月の定期請求はまだ生成できません。");
      const [y, m] = v.month.split("-").map(Number);
      const date = new Date(
        Date.UTC(
          y,
          m - 1,
          Math.min(rule.issueDay, new Date(Date.UTC(y, m, 0)).getUTCDate()),
        ),
      );
      const due = new Date(+date + rule.dueDays * 86400000);
      const snap = z
        .object({ taxRate: z.number().int().min(0).max(10000) })
        .passthrough()
        .parse(rule.snapshot);
      const input = invoiceUpsertSchema.parse({
        ...snap,
        issueDate: date,
        dueDate: due,
        status: "DRAFT",
      });
      const created = await createDraft(tx, ws.ownerId, input, snap.taxRate, key);
      await tx.recurringInvoice.update({
        where: { id: rule.id },
        data: { nextMonth: dateText(new Date(Date.UTC(y, m, 1))).slice(0, 7) },
      });
      await recordAudit(tx, ws, { action: "RECURRING_GENERATE", entity: "INVOICE", entityId: created.id, summary: `定期請求から下書きを生成（${rule.name.slice(0, 60)}）` });
      return created;
    },
    { timeout: 20000 },
  );
  refresh();
  return result;
}
