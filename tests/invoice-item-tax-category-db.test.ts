import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";

const owner = "taxcat-test-owner";
async function cleanup() {
  await prisma.invoice.deleteMany({ where: { createdById: owner } });
  await prisma.company.deleteMany({ where: { userId: owner } });
  await prisma.user.deleteMany({ where: { id: owner } });
}
let invoiceId: string;

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "invoice item tax category column",
  () => {
    beforeAll(async () => {
      await cleanup();
      await prisma.user.create({
        data: {
          id: owner,
          name: owner,
          email: owner + "@example.test",
          passwordHash: "no-login",
        },
      });
      const company = await prisma.company.create({
        data: { userId: owner, name: "取引先", invoiceCode: "TAX" },
      });
      invoiceId = (
        await prisma.invoice.create({
          data: {
            invoiceNumber: "TAXCAT-TEST-001",
            companyId: company.id,
            subject: "件名",
            issueDate: new Date("2026-09-01"),
            dueDate: new Date("2026-09-30"),
            subtotal: 1000,
            taxRate: 1000,
            taxAmount: 100,
            totalWithTax: 1100,
            withholdingTax: 0,
            grandTotal: 1100,
            createdById: owner,
          },
        })
      ).id;
    });
    afterAll(cleanup);

    it("leaves lines without a category as NULL, so the invoice's rate keeps applying", async () => {
      const item = await prisma.invoiceItem.create({
        data: {
          invoiceId,
          sortOrder: 1,
          productName: "従来どおり",
          quantity: 1,
          unitPrice: 1000,
          amount: 1000,
        },
      });
      expect(item.taxCategory).toBeNull();
    });

    it("accepts every known category", async () => {
      let order = 2;
      for (const taxCategory of [
        "TAXABLE_10",
        "TAXABLE_8",
        "EXEMPT",
        "NON_TAXABLE",
        "TAX_FREE",
      ]) {
        const item = await prisma.invoiceItem.create({
          data: {
            invoiceId,
            sortOrder: order++,
            productName: taxCategory,
            quantity: 1,
            unitPrice: 100,
            amount: 100,
            taxCategory,
          },
        });
        expect(item.taxCategory).toBe(taxCategory);
      }
    });

    it("rejects an unknown category in the database", async () => {
      await expect(
        prisma.invoiceItem.create({
          data: {
            invoiceId,
            sortOrder: 99,
            productName: "不正",
            quantity: 1,
            unitPrice: 100,
            amount: 100,
            taxCategory: "TAXABLE_5",
          },
        }),
      ).rejects.toThrow();
    });

    it("does not change the invoice totals", async () => {
      const inv = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      expect([
        inv.subtotal,
        inv.taxAmount,
        inv.totalWithTax,
        inv.grandTotal,
      ]).toEqual([1000, 100, 1100, 1100]);
    });
  },
);
