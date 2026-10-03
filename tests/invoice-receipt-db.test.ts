import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ id: "receipt-test-owner-a" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import { recordInvoiceReceipt } from "@/actions/invoice-receipt-actions";
import {
  listInvoices,
  getInvoice,
  updateInvoice,
  duplicateInvoice,
} from "@/actions/invoice-actions";
import { japanToday } from "@/lib/expenses/model";
const id = "receipt-test-invoice";
const data = {
  companyId: "receipt-test-company",
  subject: "テスト",
  issueDate: new Date("2026-01-01"),
  dueDate: new Date("2026-01-31"),
  withholdingEnabled: false,
  status: "ISSUED",
  items: [
    {
      productName: "制作",
      quantity: 1,
      unitPrice: 10000,
      amount: 10000,
      amountManuallyEdited: false,
    },
  ],
};
describe.skipIf(process.env.RUN_EXPENSE_DB_TESTS !== "1")(
  "isolated receipt database integration",
  () => {
    beforeAll(async () => {
      for (const id of ["receipt-test-owner-a", "receipt-test-owner-b"])
        await prisma.user.create({
          data: {
            id,
            name: "TEST",
            email: `${id}@example.test`,
            passwordHash: "test-not-login",
          },
        });
      await prisma.company.create({
        data: {
          id: data.companyId,
          userId: auth.id,
          name: "TEST",
          invoiceCode: "RECEIPT",
        },
      });
      await prisma.invoice.create({
        data: {
          id,
          invoiceNumber: "RECEIPT-TEST",
          createdById: auth.id,
          companyId: data.companyId,
          subject: data.subject,
          issueDate: data.issueDate,
          dueDate: data.dueDate,
          status: "ISSUED",
          subtotal: 10000,
          taxRate: 1000,
          taxAmount: 1000,
          totalWithTax: 11000,
          withholdingTax: 0,
          grandTotal: 11000,
          items: {
            create: {
              sortOrder: 1,
              productName: "制作",
              quantity: 1,
              unitPrice: 10000,
              amount: 10000,
            },
          },
        },
      });
    });
    afterAll(async () => {
      await prisma.invoice.deleteMany({
        where: {
          createdById: { in: ["receipt-test-owner-a", "receipt-test-owner-b"] },
        },
      });
      await purgeAudit(["receipt-test-owner-a", "receipt-test-owner-b"]);
      await prisma.user.deleteMany({
        where: { id: { in: ["receipt-test-owner-a", "receipt-test-owner-b"] } },
      });
      await prisma.$disconnect();
    });
    it("isolates owners, serializes competing receipts, locks paid edits, resets and never copies payment", async () => {
      const initial = await getInvoice({ invoiceId: id });
      expect(initial.receivedDate).toBeNull();
      const request = {
        invoiceId: id,
        version: initial.updatedAt.toISOString(),
        receivedDate: japanToday(),
      };
      auth.id = "receipt-test-owner-b";
      expect(await recordInvoiceReceipt(request)).toMatchObject({ ok: false });
      expect(await listInvoices({ receipt: "UNPAID" })).toEqual([]);
      await expect(getInvoice({ invoiceId: id })).rejects.toThrow();
      auth.id = "receipt-test-owner-a";
      expect(await listInvoices({ receipt: "OVERDUE" })).toHaveLength(1);
      const results = await Promise.all([
        recordInvoiceReceipt(request),
        recordInvoiceReceipt(request),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(await listInvoices({ receipt: "PAID" })).toHaveLength(1);
      expect(await listInvoices({ receipt: "UNPAID" })).toHaveLength(0);
      await expect(updateInvoice({ invoiceId: id, data })).rejects.toThrow(
        "入金済み",
      );
      expect((await getInvoice({ invoiceId: id })).items).toHaveLength(1);
      const copy = await duplicateInvoice({ invoiceId: id });
      const duplicate = await getInvoice({ invoiceId: copy.id });
      expect(duplicate.receivedDate).toBeNull();
      expect(
        await recordInvoiceReceipt({
          ...request,
          invoiceId: copy.id,
          version: duplicate.updatedAt.toISOString(),
        }),
      ).toMatchObject({ ok: false });
      const paid = await getInvoice({ invoiceId: id });
      expect(
        await recordInvoiceReceipt({
          ...request,
          version: paid.updatedAt.toISOString(),
          receivedDate: "",
        }),
      ).toMatchObject({ ok: true });
      expect((await getInvoice({ invoiceId: id })).receivedDate).toBeNull();
      await expect(
        updateInvoice({ invoiceId: id, data }),
      ).resolves.toMatchObject({ id });
    });
  },
);
