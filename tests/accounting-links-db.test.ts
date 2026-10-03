import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const auth = vi.hoisted(() => ({ id: "links-test-a" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import { initializeAccounting } from "@/actions/accounting-actions";
import {
  createInvoice,
  updateInvoice,
  getInvoice,
  listInvoices,
} from "@/actions/invoice-actions";
import { recordInvoiceReceipt } from "@/actions/invoice-receipt-actions";
import {
  matchReceipt,
  cancelReceiptMatch,
  combineInvoices,
  createRecurringInvoice,
  generateRecurringInvoice,
  importAccountingSource,
} from "@/actions/accounting-link-actions";
import { saveExpense, getExpense } from "@/actions/expense-actions";
const input = (status = "ISSUED", unitPrice = 10000) => ({
  companyId: "links-company-a",
  subject: "テスト請求",
  issueDate: new Date("2026-09-01"),
  dueDate: new Date("2026-09-30"),
  status,
  withholdingEnabled: true,
  items: [
    {
      productName: "制作",
      quantity: 1,
      unitPrice,
      amount: unitPrice,
      amountManuallyEdited: false,
    },
  ],
});
async function balances(code: string) {
  const a = await prisma.account.findFirstOrThrow({
    where: { userId: "links-test-a", code },
  });
  const sum = await prisma.journalLine.aggregate({
    where: { userId: "links-test-a", accountId: a.id },
    _sum: { debit: true, credit: true },
  });
  return (sum._sum.debit ?? 0) - (sum._sum.credit ?? 0);
}
async function cleanup() {
  await prisma.journalEntry.deleteMany({
    where: { userId: { in: ["links-test-a", "links-test-b"] } },
  });
  await prisma.invoice.deleteMany({
    where: { createdById: { in: ["links-test-a", "links-test-b"] } },
  });
  await Promise.all([
    prisma.accountingSource.deleteMany({
      where: { userId: { in: ["links-test-a", "links-test-b"] } },
    }),
    prisma.receiptMatch.deleteMany({
      where: { userId: { in: ["links-test-a", "links-test-b"] } },
    }),
    prisma.recurringInvoice.deleteMany({
      where: { userId: { in: ["links-test-a", "links-test-b"] } },
    }),
  ]);
  await purgeAudit(["links-test-a", "links-test-b"]);
  await prisma.user.deleteMany({
    where: { id: { in: ["links-test-a", "links-test-b"] } },
  });
}
describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "invoice and accounting integration",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of ["links-test-a", "links-test-b"])
        await prisma.user.create({
          data: {
            id,
            name: "TEST",
            email: `${id}@example.test`,
            passwordHash: "test-no-login",
          },
        });
      await prisma.company.create({
        data: {
          id: "links-company-a",
          userId: auth.id,
          name: "テスト会社",
          invoiceCode: "LINK",
        },
      });
      await initializeAccounting({
        industry: "SERVICE",
        startDate: "2026-01-01",
      });
    });
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });
    it("posts on issue, reverses corrections, and handles withholding on receipt without duplication", async () => {
      const created = await createInvoice(input());
      expect(await balances("120")).toBe(11000);
      expect(await balances("400")).toBe(-11000);
      await updateInvoice({
        invoiceId: created.id,
        data: input("ISSUED", 20000),
      });
      expect(await balances("120")).toBe(22000);
      const inv = await getInvoice({ invoiceId: created.id });
      const before = await prisma.journalEntry.count({
        where: { userId: auth.id },
      });
      await updateInvoice({
        invoiceId: created.id,
        data: input("ISSUED", 20000),
      });
      expect(
        await prisma.journalEntry.count({ where: { userId: auth.id } }),
      ).toBe(before);
      const current = await getInvoice({ invoiceId: created.id });
      expect(
        await recordInvoiceReceipt({
          invoiceId: created.id,
          version: current.updatedAt.toISOString(),
          receivedDate: "2026-09-20",
        }),
      ).toMatchObject({ ok: true });
      expect(await balances("120")).toBe(0);
      expect(await balances("110")).toBe(inv.grandTotal);
      expect(await balances("130")).toBe(inv.withholdingTax);
      const paid = await getInvoice({ invoiceId: created.id });
      expect(
        await recordInvoiceReceipt({
          invoiceId: created.id,
          version: paid.updatedAt.toISOString(),
          receivedDate: "",
        }),
      ).toMatchObject({ ok: true });
      expect(await balances("110")).toBe(0);
      expect(await balances("120")).toBe(22000);
    });
    it("matches one bank receipt against multiple invoices atomically, blocks stale/cross-user and cancels together", async () => {
      const b = await createInvoice(input());
      const rows = await prisma.invoice.findMany({
        where: { createdById: auth.id, status: "ISSUED" },
      });
      const v = {
        id: "81111111-1111-4111-8111-111111111111",
        date: "2026-09-22",
        payer: "テスト会社",
        amount: rows.reduce((s, i) => s + i.grandTotal, 0),
        invoices: rows.map((i) => ({
          id: i.id,
          version: i.updatedAt.toISOString(),
        })),
      };
      await expect(
        matchReceipt({ ...v, amount: v.amount - 1 }),
      ).rejects.toThrow("一致");
      auth.id = "links-test-b";
      await expect(matchReceipt(v)).rejects.toThrow();
      auth.id = "links-test-a";
      await matchReceipt(v);
      await matchReceipt(v);
      expect(await balances("120")).toBe(0);
      const paid = await getInvoice({ invoiceId: b.id });
      expect(
        await recordInvoiceReceipt({
          invoiceId: b.id,
          version: paid.updatedAt.toISOString(),
          receivedDate: "",
        }),
      ).toMatchObject({ ok: false });
      await expect(
        matchReceipt({ ...v, id: "82111111-1111-4111-8111-111111111111" }),
      ).rejects.toThrow();
      await cancelReceiptMatch(v.id);
      expect(await balances("120")).toBe(33000);
      expect((await getInvoice({ invoiceId: b.id })).receivedDate).toBeNull();
    });
    it("links costs and payments and reverses unpaid edits", async () => {
      const id = "83111111-1111-4111-8111-111111111111";
      const form = (version?: string, paidDate = "") => {
        const f = new FormData();
        for (const [k, v] of Object.entries({
          id,
          supplier: "仕入先",
          description: "商品",
          category: "仕入",
          amount: "5500",
          costMonth: "2026-09",
          dueDate: "2026-09-30",
          paidDate,
          note: "",
          ...(version ? { version } : {}),
        }))
          f.set(k, v);
        return f;
      };
      expect(await saveExpense(form())).toMatchObject({ ok: true });
      expect(await balances("200")).toBe(-5500);
      expect(await balances("500")).toBe(5500);
      expect(
        await saveExpense(form((await getExpense(id))!.version, "2026-09-25")),
      ).toMatchObject({ ok: true });
      expect(await balances("200")).toBe(0);
      expect(await balances("110")).toBe(-5500);
      expect(
        await saveExpense(form((await getExpense(id))!.version)),
      ).toMatchObject({ ok: true });
      expect(await balances("110")).toBe(0);
    });
    it("generates monthly drafts only once, clamps month-end, and combines drafts without double issuance", async () => {
      const a = await createInvoice(input("DRAFT")),
        b = await createInvoice(input("DRAFT"));
      const source = await getInvoice({ invoiceId: a.id });
      const ruleId = "84111111-1111-4111-8111-111111111111";
      await createRecurringInvoice({
        id: ruleId,
        sourceId: a.id,
        version: source.updatedAt.toISOString(),
        name: "月額",
        nextMonth: "2026-02",
        issueDay: 31,
        dueDays: 30,
      });
      const rule = await prisma.recurringInvoice.findUniqueOrThrow({
        where: { id: ruleId },
      });
      const gen = await generateRecurringInvoice({
        id: rule.id,
        month: "2026-02",
      });
      expect(
        await generateRecurringInvoice({ id: rule.id, month: "2026-02" }),
      ).toEqual(gen);
      const generated = await getInvoice({ invoiceId: gen.id });
      expect(generated.status).toBe("DRAFT");
      expect(generated.issueDate.toISOString().slice(0, 10)).toBe("2026-02-28");
      expect(
        (
          await prisma.recurringInvoice.findUniqueOrThrow({
            where: { id: rule.id },
          })
        ).nextMonth,
      ).toBe("2026-03");
      const sources = await Promise.all(
        [a.id, b.id].map((invoiceId) => getInvoice({ invoiceId })),
      );
      const request = {
        requestKey: "85111111-1111-4111-8111-111111111111",
        invoices: sources.map((i) => ({
          id: i.id,
          version: i.updatedAt.toISOString(),
        })),
        date: "2026-09-27",
        dueDate: "2026-10-31",
        subject: "合算",
      };
      const combined = await combineInvoices(request);
      expect(await combineInvoices(request)).toEqual(combined);
      expect((await getInvoice({ invoiceId: combined.id })).items).toHaveLength(
        2,
      );
      expect((await listInvoices()).some((i) => i.id === a.id)).toBe(false);
      await expect(
        updateInvoice({ invoiceId: a.id, data: input() }),
      ).rejects.toThrow("合算済み");
      expect(await balances("120")).toBe(33000);
    });
    it("keeps legacy data opt-in and rolls back invoice creation if its journal fails", async () => {
      const old = await createInvoice({
        ...input(),
        issueDate: new Date("2025-12-01"),
      });
      const legacy = await getInvoice({ invoiceId: old.id });
      await importAccountingSource({
        type: "invoice",
        id: old.id,
        version: legacy.updatedAt.toISOString(),
      });
      expect(await balances("120")).toBe(33000);
      const ar = await prisma.account.findFirstOrThrow({
        where: { userId: auth.id, code: "120" },
      });
      await prisma.account.update({
        where: { id: ar.id },
        data: { active: false },
      });
      const before = await prisma.invoice.count({
        where: { createdById: auth.id },
      });
      await expect(createInvoice(input())).rejects.toThrow();
      expect(
        await prisma.invoice.count({ where: { createdById: auth.id } }),
      ).toBe(before);
      await prisma.account.update({
        where: { id: ar.id },
        data: { active: true },
      });
    });
  },
);
