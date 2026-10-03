import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "invtax-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import { initializeAccounting } from "@/actions/accounting-actions";
import {
  createInvoice,
  duplicateInvoice,
  getInvoice,
  updateInvoice,
} from "@/actions/invoice-actions";
import { combineInvoices } from "@/actions/accounting-link-actions";
import { invoiceTaxGroups } from "@/lib/invoice/taxBreakdown";
import { renderInvoicePdf } from "@/lib/pdf/render-invoice";
import { settings } from "./fixtures";

const owner = "invtax-test-owner";
const line = (
  productName: string,
  amount: number,
  taxCategory?: string | null,
) => ({
  productName,
  quantity: 1,
  unitPrice: amount,
  amount,
  amountManuallyEdited: false,
  ...(taxCategory === undefined ? {} : { taxCategory }),
});
const input = (items: ReturnType<typeof line>[], status = "DRAFT") => ({
  companyId: "invtax-company",
  subject: "税区分テスト",
  issueDate: new Date("2026-09-01"),
  dueDate: new Date("2026-09-30"),
  status,
  withholdingEnabled: false,
  items,
});
async function cleanup() {
  await prisma.journalEntry.deleteMany({ where: { userId: owner } });
  await prisma.accountingSource.deleteMany({ where: { userId: owner } });
  await prisma.invoice.deleteMany({ where: { createdById: owner } });
  await purgeAudit([owner]);
  await prisma.account.deleteMany({ where: { userId: owner } });
  await prisma.accountingSetting.deleteMany({ where: { userId: owner } });
  await prisma.company.deleteMany({ where: { userId: owner } });
  await prisma.systemSetting.deleteMany({ where: { userId: owner } });
  await prisma.user.deleteMany({ where: { id: owner } });
}
const taxOf = (i: {
  subtotal: number;
  taxAmount: number;
  totalWithTax: number;
}) => [i.subtotal, i.taxAmount, i.totalWithTax];

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "invoice tax categories end to end",
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
      await prisma.company.create({
        data: {
          id: "invtax-company",
          userId: owner,
          name: "税区分テスト株式会社",
          invoiceCode: "TAX",
        },
      });
      await initializeAccounting({
        industry: "SERVICE",
        startDate: "2026-01-01",
      });
    });
    afterAll(cleanup);

    it("stores categories and rounds each rate once", async () => {
      const c = await createInvoice(
        input([
          line("標準", 1001, "TAXABLE_10"),
          line("飲食料品", 999, "TAXABLE_8"),
          line("保険料", 500, "EXEMPT"),
        ]),
      );
      const inv = await getInvoice({ invoiceId: c.id });
      expect(taxOf(inv)).toEqual([2500, 179, 2679]);
      expect(inv.items.map((i) => i.taxCategory)).toEqual([
        "TAXABLE_10",
        "TAXABLE_8",
        "EXEMPT",
      ]);
      expect(
        invoiceTaxGroups(inv).map((g) => [g.label, g.subtotal, g.taxAmount]),
      ).toEqual([
        ["10%", 1001, 100],
        ["軽減8%※", 999, 79],
        ["非課税", 500, 0],
      ]);
    });

    it("leaves an invoice without categories exactly as before, also when it is edited and saved again", async () => {
      const c = await createInvoice(input([line("A", 1001), line("B", 999)]));
      expect(taxOf(await getInvoice({ invoiceId: c.id }))).toEqual([
        2000, 200, 2200,
      ]);
      await updateInvoice({
        invoiceId: c.id,
        data: input([line("A", 1001), line("B", 999)]),
      });
      const inv = await getInvoice({ invoiceId: c.id });
      expect(taxOf(inv)).toEqual([2000, 200, 2200]);
      expect(inv.items.every((i) => i.taxCategory === null)).toBe(true);
      expect(invoiceTaxGroups(inv)).toHaveLength(1);
    });

    it("recalculates only when categories are added or removed", async () => {
      const c = await createInvoice(input([line("A", 1001), line("B", 999)]));
      await updateInvoice({
        invoiceId: c.id,
        data: input([
          line("A", 1001, "TAXABLE_10"),
          line("B", 999, "TAXABLE_8"),
        ]),
      });
      expect(taxOf(await getInvoice({ invoiceId: c.id }))).toEqual([
        2000, 179, 2179,
      ]);
      await updateInvoice({
        invoiceId: c.id,
        data: input([line("A", 1001, null), line("B", 999, "")]),
      });
      expect(taxOf(await getInvoice({ invoiceId: c.id }))).toEqual([
        2000, 200, 2200,
      ]);
    });

    it("rejects an unknown category", async () => {
      await expect(
        createInvoice(input([line("A", 1000, "TAXABLE_5")])),
      ).rejects.toThrow();
    });

    it("keeps categories when an invoice is duplicated or combined", async () => {
      const a = await createInvoice(input([line("標準", 1001, "TAXABLE_10")]));
      const b = await createInvoice(input([line("軽減", 999, "TAXABLE_8")]));
      const copy = await duplicateInvoice({ invoiceId: a.id });
      const copied = await getInvoice({ invoiceId: copy.id });
      expect(copied.items.map((i) => i.taxCategory)).toEqual(["TAXABLE_10"]);
      expect(taxOf(copied)).toEqual([1001, 100, 1101]);
      const sources = await Promise.all(
        [a.id, b.id].map((invoiceId) => getInvoice({ invoiceId })),
      );
      const merged = await combineInvoices({
        requestKey: crypto.randomUUID(),
        subject: "合算",
        date: "2026-09-20",
        dueDate: "2026-10-20",
        invoices: sources.map((i) => ({
          id: i.id,
          version: i.updatedAt.toISOString(),
        })),
      });
      const m = await getInvoice({ invoiceId: merged.id });
      expect(m.items.map((i) => i.taxCategory).sort()).toEqual([
        "TAXABLE_10",
        "TAXABLE_8",
      ]);
      expect(taxOf(m)).toEqual([2000, 179, 2179]);
    });

    it("posts the tax-included total to accounts receivable, unaffected by categories", async () => {
      const c = await createInvoice(
        input(
          [line("標準", 1001, "TAXABLE_10"), line("軽減", 999, "TAXABLE_8")],
          "ISSUED",
        ),
      );
      const entries = await prisma.journalEntry.findMany({
        where: { userId: owner, sourceId: c.id },
        include: { lines: true },
      });
      expect(entries.length).toBeGreaterThan(0);
      const debit = entries
        .flatMap((e) => e.lines)
        .reduce((s, l) => s + l.debit, 0);
      const credit = entries
        .flatMap((e) => e.lines)
        .reduce((s, l) => s + l.credit, 0);
      expect(debit).toBe(2179);
      expect(credit).toBe(2179);
    });

    it("renders the PDF for a mixed-rate invoice", async () => {
      const c = await createInvoice(
        input([
          line("標準の品目", 1001, "TAXABLE_10"),
          line("飲食料品", 999, "TAXABLE_8"),
          line("保険料", 500, "EXEMPT"),
        ]),
      );
      const inv = await getInvoice({ invoiceId: c.id });
      const pdf = await renderInvoicePdf(
        {
          ...inv,
          company: { name: "税区分テスト株式会社", paymentTerms: null },
        },
        { ...settings, invoiceRegistrationNumber: "T1234567890123" },
      );
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      const folder = path.resolve("../work/pdf");
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "invoice-tax-mixed.pdf"), pdf);
    });
  },
);
