"use server";

import { InvoiceStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { invoiceUpsertSchema, type InvoiceUpsertInput } from "@/lib/validators/invoice";
import { calculateInvoice } from "@/lib/invoice/calculateInvoice";
import { generateInvoiceNumber } from "@/lib/invoice/generateInvoiceNumber";
import { generateShareToken } from "@/lib/invoice/generateShareToken";
import { INVOICE_NUMBER_CONFLICT_MESSAGE } from "@/lib/invoice/invoice-messages";
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

function buildCalc(normalizedItems: ReturnType<typeof buildNormalizedItems>, taxRateBps: number, withholdingEnabled: boolean) {
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
  companyId?: string;
  q?: string;
  status?: InvoiceStatus | "ALL";
  withholding?: "ALL" | "ON" | "OFF";
};

export async function listInvoices(filters: InvoiceListFilters = {}) {
  const user = await requireUser();

  const where: Prisma.InvoiceWhereInput = {
    createdById: user.id,
  };

  if (filters.companyId) where.companyId = filters.companyId;
  if (filters.q) where.subject = { contains: filters.q, mode: "insensitive" };
  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.withholding === "ON") where.withholdingEnabled = true;
  if (filters.withholding === "OFF") where.withholdingEnabled = false;

  return prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      invoiceNumber: true,
      subject: true,
      issueDate: true,
      dueDate: true,
      grandTotal: true,
      withholdingEnabled: true,
      status: true,
      createdAt: true,
      company: { select: { id: true, name: true } },
    },
  });
}

export type InvoiceWithItems = Prisma.PromiseReturnType<typeof getInvoice>;

export async function getInvoice(params: { invoiceId: string }) {
  const user = await requireUser();

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, createdById: user.id },
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
  const user = await requireUser();
  void user;

  const settings = await prisma.systemSetting.findUnique({
    where: { id: "singleton" },
  });
  if (!settings) throw new Error("SYSTEM_SETTING_NOT_FOUND");
  return settings;
}

export async function createInvoice(raw: unknown) {
  const user = await requireUser();
  const input = invoiceUpsertSchema.parse(raw) satisfies InvoiceUpsertInput;

  const settings = await prisma.systemSetting.findUnique({
    where: { id: "singleton" },
    select: { taxRate: true },
  });
  const taxRateBps = settings?.taxRate ?? 1000;

  try {
    return await prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: input.companyId, userId: user.id },
        select: { id: true },
      });
      if (!company) throw new Error("FORBIDDEN_COMPANY");

      const normalizedItems = buildNormalizedItems(input);
      const calc = buildCalc(normalizedItems, taxRateBps, input.withholdingEnabled);

      const invoiceNumber = await generateInvoiceNumber({
        prisma: tx,
        companyId: input.companyId,
        issueDate: input.issueDate,
        currentUserId: user.id,
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
          createdById: user.id,
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

export async function updateInvoice(params: { invoiceId: string; data: unknown }) {
  const user = await requireUser();
  const input = invoiceUpsertSchema.parse(params.data) satisfies InvoiceUpsertInput;

  const settings = await prisma.systemSetting.findUnique({
    where: { id: "singleton" },
    select: { taxRate: true },
  });
  const taxRateBps = settings?.taxRate ?? 1000;

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: params.invoiceId, createdById: user.id },
      select: { id: true, companyId: true },
    });
    if (!invoice) throw new Error("FORBIDDEN_INVOICE");

    const company = await tx.company.findFirst({
      where: { id: input.companyId, userId: user.id },
      select: { id: true },
    });
    if (!company) throw new Error("FORBIDDEN_COMPANY");

    const normalizedItems = buildNormalizedItems(input);
    const calc = buildCalc(normalizedItems, taxRateBps, input.withholdingEnabled);

    await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });

    const now = new Date();
    await tx.invoice.update({
      where: { id: invoice.id },
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

    revalidatePath("/invoices");
    revalidatePath(`/invoices/${invoice.id}`);
    revalidatePath(`/companies/${input.companyId}`);
    return { id: invoice.id };
  });
}

/**
 * 下書き（DRAFT）のみ自動保存。バリデーション未充足時は no-op。
 */
export async function saveInvoiceAutosave(params: { invoiceId?: string | null; data: unknown }) {
  const parsed = invoiceUpsertSchema.safeParse(params.data);
  if (!parsed.success) {
    return { ok: false as const, reason: "invalid" as const };
  }
  const input = parsed.data;
  if (input.status !== "DRAFT") {
    return { ok: true as const, skipped: true as const };
  }

  if (params.invoiceId) {
    await updateInvoice({ invoiceId: params.invoiceId, data: input });
    return { ok: true as const, invoiceId: params.invoiceId };
  }

  try {
    const created = await createInvoice(input);
    return { ok: true as const, invoiceId: created.id };
  } catch (e) {
    if (e instanceof Error && e.message === INVOICE_NUMBER_CONFLICT_MESSAGE) {
      return { ok: false as const, reason: "number_conflict" as const };
    }
    throw e;
  }
}

export async function duplicateInvoice(params: { invoiceId: string }): Promise<{ id: string }> {
  const user = await requireUser();

  const settings = await prisma.systemSetting.findUnique({
    where: { id: "singleton" },
    select: { taxRate: true },
  });
  const taxRateBps = settings?.taxRate ?? 1000;

  try {
    return await prisma.$transaction(async (tx) => {
      const src = await tx.invoice.findFirst({
        where: { id: params.invoiceId, createdById: user.id },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
      if (!src) throw new Error("FORBIDDEN_INVOICE");

      const today = startOfToday();
      const due = addDays(today, 30);
      const subjectBase = src.subject.trimEnd();
      const subject = subjectBase.endsWith("（複製）") ? subjectBase : `${subjectBase}（複製）`;

      const invoiceNumber = await generateInvoiceNumber({
        prisma: tx,
        companyId: src.companyId,
        issueDate: today,
        currentUserId: user.id,
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
          createdById: user.id,
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
