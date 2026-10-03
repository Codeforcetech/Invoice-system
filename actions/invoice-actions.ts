"use server";

import { accountingLock } from "@/lib/accounting/service";
import { syncInvoice } from "@/lib/accounting/sync";
import { japanToday } from "@/lib/expenses/model";
import { invoiceDateFilter } from "@/lib/dashboard/sales";
import { InvoiceStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import {
  invoiceUpsertSchema,
  type InvoiceUpsertInput,
} from "@/lib/validators/invoice";
import { calculateInvoice } from "@/lib/invoice/calculateInvoice";
import { generateInvoiceNumber } from "@/lib/invoice/generateInvoiceNumber";
import { generateShareToken } from "@/lib/invoice/generateShareToken";
import { INVOICE_NUMBER_CONFLICT_MESSAGE } from "@/lib/invoice/invoice-messages";
import { getOrCreateSystemSetting } from "@/lib/settings/system-setting";
import { isUniqueOnInvoiceNumber } from "@/lib/prisma-errors";

function toYenInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value);
}

function toPrismaDecimalFromNumber(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n.toFixed(2));
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function buildNormalizedItems(input: InvoiceUpsertInput) {
  return input.items.map((it) => {
    const autoAmount = toYenInt(it.quantity * it.unitPrice);
    const amount = it.amountManuallyEdited ? it.amount : autoAmount;
    return {
      productName: it.productName,
      unit: it.unit ?? null,
      quantity: toPrismaDecimalFromNumber(it.quantity),
      unitPrice: it.unitPrice,
      amount: toYenInt(amount),
      amountManuallyEdited: it.amountManuallyEdited,
      note: it.note ?? null,
    };
  });
}

function buildCalc(
  normalizedItems: ReturnType<typeof buildNormalizedItems>,
  taxRateBps: number,
  withholdingEnabled: boolean,
) {
  return calculateInvoice({
    items: normalizedItems.map((it) => ({
      quantity: Number(it.quantity),
      unitPrice: it.unitPrice,
      amount: it.amount,
      amountManuallyEdited: it.amountManuallyEdited,
    })),
    taxRateBps,
    withholdingEnabled,
  });
}

export type InvoiceListFilters = {
  fromMonth?: string;
  toMonth?: string;
  companyId?: string;
  q?: string;
  status?: InvoiceStatus | "ALL";
  withholding?: "ALL" | "ON" | "OFF";
  receipt?: "ALL" | "PAID" | "UNPAID" | "OVERDUE";
};

export async function listInvoices(filters: InvoiceListFilters = {}) {
  const ws = await requireWorkspace("VIEWER");

  const where: Prisma.InvoiceWhereInput = {
    createdById: ws.ownerId,
    mergedIntoId: null,
  };

  const dateFilter = invoiceDateFilter(filters.fromMonth, filters.toMonth);
  if (dateFilter) where.issueDate = dateFilter;
  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.q?.trim()) {
    const term = filters.q.trim().slice(0, 200);
    where.OR = [
      { subject: { contains: term, mode: "insensitive" } },
      { invoiceNumber: { contains: term, mode: "insensitive" } },
      { company: { name: { contains: term, mode: "insensitive" } } },
    ];
  }
  if (
    filters.status === "DRAFT" ||
    filters.status === "CONFIRMED" ||
    filters.status === "ISSUED"
  )
    where.status = filters.status;
  if (filters.withholding === "ON") where.withholdingEnabled = true;
  if (filters.withholding === "OFF") where.withholdingEnabled = false;

  if (["PAID", "UNPAID", "OVERDUE"].includes(filters.receipt ?? "")) {
    where.status = "ISSUED";
    where.receivedDate = filters.receipt === "PAID" ? { not: null } : null;
    if (filters.receipt === "OVERDUE")
      where.dueDate = { lt: new Date(japanToday()) };
  }

  return prisma.invoice.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      subject: true,
      issueDate: true,
      dueDate: true,
      grandTotal: true,
      withholdingEnabled: true,
      status: true,
      receivedDate: true,
      receiptMatchId: true,
      mergedIntoId: true,
      createdAt: true,
      updatedAt: true,
      company: { select: { id: true, name: true } },
    },
  });
}

export type InvoiceWithItems = Prisma.PromiseReturnType<typeof getInvoice>;

export async function getInvoice(params: { invoiceId: string }) {
  const ws = await requireWorkspace("VIEWER");

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, createdById: ws.ownerId },
    select: {
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
      receivedDate: true,
      receiptMatchId: true,
      mergedIntoId: true,
      createdAt: true,
      updatedAt: true,
      autosaveUpdatedAt: true,
      company: {
        select: {
          id: true,
          name: true,
          invoiceCode: true,
          paymentTerms: true,
          billingEmail: true,
          billingCcEmail: true,
        },
      },
      items: {
        orderBy: { sortOrder: "asc" },
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
    },
  });

  if (!invoice) throw new Error("FORBIDDEN_INVOICE");
  return invoice;
}

export async function getSystemSetting() {
  const ws = await requireWorkspace("VIEWER");
  return getOrCreateSystemSetting(ws.ownerId);
}

export async function createInvoice(raw: unknown) {
  const ws = await requireWorkspace("EDITOR");
  const input = invoiceUpsertSchema.parse(raw) satisfies InvoiceUpsertInput;

  const settings = await getOrCreateSystemSetting(ws.ownerId);
  const taxRateBps = settings.taxRate;

  try {
    return await prisma.$transaction(async (tx) => {
      await accountingLock(tx,ws.ownerId);
      const company = await tx.company.findFirst({
        where: { id: input.companyId, userId: ws.ownerId },
        select: { id: true },
      });
      if (!company) throw new Error("FORBIDDEN_COMPANY");

      const normalizedItems = buildNormalizedItems(input);
      const calc = buildCalc(
        normalizedItems,
        taxRateBps,
        input.withholdingEnabled,
      );

      const invoiceNumber = await generateInvoiceNumber({
        prisma: tx,
        companyId: input.companyId,
        issueDate: input.issueDate,
        currentUserId: ws.ownerId,
      });

      const now = new Date();
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          companyId: input.companyId,
          subject: input.subject,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          subtotal: calc.subtotal,
          taxRate: taxRateBps,
          taxAmount: calc.taxAmount,
          totalWithTax: calc.totalWithTax,
          withholdingEnabled: input.withholdingEnabled,
          withholdingTax: calc.withholdingTax,
          grandTotal: calc.grandTotal,
          status: input.status as InvoiceStatus,
          shareToken: generateShareToken(),
          createdById: ws.ownerId,
          autosaveUpdatedAt: now,
          items: {
            create: normalizedItems.map((it, idx) => ({
              sortOrder: idx + 1,
              ...it,
            })),
          },
        },
        select: { id: true, invoiceNumber: true },
      });

      await syncInvoice(tx,ws.ownerId,created.id);
      await recordAudit(tx, ws, {
        action: "INVOICE_CREATE",
        entity: "INVOICE",
        entityId: created.id,
        summary: `請求書 ${created.invoiceNumber} を作成（${input.status}）`,
      });
      revalidatePath("/accounting", "layout");
      revalidatePath("/invoices");
      revalidatePath(`/companies/${input.companyId}`);
      revalidatePath(`/invoices/${created.id}`);
      return created;
    });
  } catch (e) {
    if (isUniqueOnInvoiceNumber(e)) {
      throw new Error(INVOICE_NUMBER_CONFLICT_MESSAGE);
    }
    throw e;
  }
}

export async function updateInvoice(params: {
  invoiceId: string;
  data: unknown;
}) {
  const ws = await requireWorkspace("EDITOR");
  const input = invoiceUpsertSchema.parse(
    params.data,
  ) satisfies InvoiceUpsertInput;

  const settings = await getOrCreateSystemSetting(ws.ownerId);
  const taxRateBps = settings.taxRate;

  return prisma.$transaction(async (tx) => {
      await accountingLock(tx,ws.ownerId);
    const invoice = await tx.invoice.findFirst({
      where: { id: params.invoiceId, createdById: ws.ownerId },
      select: {
        id: true,
        companyId: true,
        invoiceNumber: true,
        receivedDate: true,
        mergedIntoId: true,
      },
    });
    if (!invoice) throw new Error("FORBIDDEN_INVOICE");
    if (invoice.mergedIntoId) throw new Error("合算済みの請求書は編集できません。");
    if (invoice.receivedDate)
      throw new Error(
        "入金済みの請求書は編集できません。入金記録を取り消してから編集してください。",
      );

    const company = await tx.company.findFirst({
      where: { id: input.companyId, userId: ws.ownerId },
      select: { id: true },
    });
    if (!company) throw new Error("FORBIDDEN_COMPANY");

    const normalizedItems = buildNormalizedItems(input);
    const calc = buildCalc(
      normalizedItems,
      taxRateBps,
      input.withholdingEnabled,
    );

    await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });

    const now = new Date();
    await tx.invoice.update({
      where: { id: invoice.id, createdById: ws.ownerId, receivedDate: null },
      data: {
        companyId: input.companyId,
        subject: input.subject,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        subtotal: calc.subtotal,
        taxRate: taxRateBps,
        taxAmount: calc.taxAmount,
        totalWithTax: calc.totalWithTax,
        withholdingEnabled: input.withholdingEnabled,
        withholdingTax: calc.withholdingTax,
        grandTotal: calc.grandTotal,
        status: input.status as InvoiceStatus,
        autosaveUpdatedAt: now,
        items: {
          create: normalizedItems.map((it, idx) => ({
            sortOrder: idx + 1,
            ...it,
          })),
        },
      },
      select: { id: true },
    });

    await syncInvoice(tx,ws.ownerId,invoice.id);
    await recordAudit(tx, ws, {
      action: "INVOICE_UPDATE",
      entity: "INVOICE",
      entityId: invoice.id,
      summary: `請求書 ${invoice.invoiceNumber} を更新（${input.status}）`,
    });
    revalidatePath("/accounting", "layout");
    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoice.id}`);
    revalidatePath(`/companies/${input.companyId}`);
    return { id: invoice.id, invoiceNumber: invoice.invoiceNumber };
  });
}

/**
 * 下書き（DRAFT）のみ自動保存。バリデーション未充足時は no-op。
 */
export async function saveInvoiceAutosave(params: {
  invoiceId?: string | null;
  data: unknown;
}) {
  const parsed = invoiceUpsertSchema.safeParse(params.data);
  if (!parsed.success) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const input = parsed.data;
  if (input.status !== "DRAFT") {
    return { ok: true as const, skipped: true as const };
  }

  if (params.invoiceId) {
    const updated = await updateInvoice({
      invoiceId: params.invoiceId,
      data: input,
    });
    return {
      ok: true as const,
      invoiceId: updated.id,
      invoiceNumber: updated.invoiceNumber,
    };
  }

  try {
    const created = await createInvoice(input);
    return {
      ok: true as const,
      invoiceId: created.id,
      invoiceNumber: created.invoiceNumber,
    };
  } catch (e) {
    if (e instanceof Error && e.message === INVOICE_NUMBER_CONFLICT_MESSAGE) {
      return { ok: false as const, reason: "number_conflict" as const };
    }
    throw e;
  }
}

export async function duplicateInvoice(params: {
  invoiceId: string;
}): Promise<{ id: string }> {
  const ws = await requireWorkspace("EDITOR");

  const settings = await getOrCreateSystemSetting(ws.ownerId);
  const taxRateBps = settings.taxRate;

  try {
    return await prisma.$transaction(async (tx) => {
      await accountingLock(tx,ws.ownerId);
      const src = await tx.invoice.findFirst({
        where: { id: params.invoiceId, createdById: ws.ownerId },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      if (!src) throw new Error("FORBIDDEN_INVOICE");

      const today = startOfToday();
      const due = addDays(today, 30);
      const subjectBase = src.subject.trimEnd();
      const subject = subjectBase.endsWith("（複製）")
        ? subjectBase
        : `${subjectBase}（複製）`;

      const invoiceNumber = await generateInvoiceNumber({
        prisma: tx,
        companyId: src.companyId,
        issueDate: today,
        currentUserId: ws.ownerId,
      });

      const normalizedItems = src.items.map((it) => ({
        productName: it.productName,
        unit: it.unit,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        amount: it.amount,
        amountManuallyEdited: it.amountManuallyEdited,
        note: it.note,
      }));

      const calc = calculateInvoice({
        items: normalizedItems.map((it) => ({
          quantity: Number(it.quantity),
          unitPrice: it.unitPrice,
          amount: it.amount,
          amountManuallyEdited: it.amountManuallyEdited,
        })),
        taxRateBps,
        withholdingEnabled: src.withholdingEnabled,
      });

      const now = new Date();
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          companyId: src.companyId,
          subject,
          issueDate: today,
          dueDate: due,
          subtotal: calc.subtotal,
          taxRate: taxRateBps,
          taxAmount: calc.taxAmount,
          totalWithTax: calc.totalWithTax,
          withholdingEnabled: src.withholdingEnabled,
          withholdingTax: calc.withholdingTax,
          grandTotal: calc.grandTotal,
          status: InvoiceStatus.DRAFT,
          shareToken: generateShareToken(),
          createdById: ws.ownerId,
          autosaveUpdatedAt: now,
          items: {
            create: normalizedItems.map((it, idx) => ({
              sortOrder: idx + 1,
              ...it,
            })),
          },
        },
        select: { id: true },
      });
      await recordAudit(tx, ws, {
        action: "INVOICE_DUPLICATE",
        entity: "INVOICE",
        entityId: created.id,
        summary: "請求書を複製して下書きを作成",
      });

      revalidatePath("/invoices");
      revalidatePath(`/companies/${src.companyId}`);
      return created;
    });
  } catch (e) {
    if (isUniqueOnInvoiceNumber(e)) {
      throw new Error(INVOICE_NUMBER_CONFLICT_MESSAGE);
    }
    throw e;
  }
}
