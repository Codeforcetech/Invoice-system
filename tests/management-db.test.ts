import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const auth = vi.hoisted(() => ({ id: "management-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import { initializeAccounting } from "@/actions/accounting-actions";
import { saveReportAnnotation } from "@/actions/management-actions";
import { postJournal, reverseJournal } from "@/lib/accounting/service";
import { syncInvoice, syncExpense } from "@/lib/accounting/sync";
import {
  managementReport,
  transferRows,
  reportTable,
} from "@/lib/management/report";
import { emptyAnnotation } from "@/lib/management/model";
const ids = ["management-test-owner", "management-test-other"];
let invoiceId: string, expenseId: string, journalId: string;
const filters = { from: "2026-09", to: "2026-10" };
async function cleanup() {
  for (const userId of ids) {
    await prisma.reportAnnotation.deleteMany({ where: { userId } });
    await prisma.accountingSource.deleteMany({ where: { userId } });
    await prisma.journalEntry.deleteMany({ where: { userId } });
    await prisma.invoice.deleteMany({ where: { createdById: userId } });
    await prisma.expense.deleteMany({ where: { userId } });
    await purgeAudit([userId]);
    await prisma.user.deleteMany({ where: { id: userId } });
  }
}
describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "management report database",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of ids) {
        auth.id = id;
        await prisma.user.create({
          data: {
            id,
            name: "test",
            email: `${id}@example.test`,
            passwordHash: "no-login",
          },
        });
        await initializeAccounting({
          startDate: "2026-01-01",
          industry: "SERVICE",
        });
      }
      auth.id = ids[0];
      const company = await prisma.company.create({
        data: {
          userId: auth.id,
          name: "テスト取引先",
          invoiceCode: "MANAGEMENT",
        },
      });
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: "MANAGEMENT-TEST",
          companyId: company.id,
          createdById: auth.id,
          subject: "テスト",
          issueDate: new Date("2026-09-30T15:00:00Z"),
          dueDate: new Date("2026-10-30T15:00:00Z"),
          subtotal: 10000,
          taxRate: 1000,
          taxAmount: 1000,
          totalWithTax: 11000,
          withholdingEnabled: true,
          withholdingTax: 1021,
          grandTotal: 9979,
          status: "ISSUED",
          items: {
            create: [
              {
                sortOrder: 0,
                productName: "商品",
                quantity: 1,
                unitPrice: 10000,
                amount: 10000,
              },
            ],
          },
        },
      });
      invoiceId = invoice.id;
      const expense = await prisma.expense.create({
        data: {
          userId: auth.id,
          supplier: "支払先",
          description: "通信費",
          category: "通信・サブスク",
          amount: 3300,
          costMonth: "2026-10",
          dueDate: new Date("2026-10-20"),
        },
      });
      expenseId = expense.id;
      await prisma.$transaction(async (tx) => {
        await syncInvoice(tx, auth.id, invoiceId);
        await syncExpense(tx, auth.id, expenseId);
      });
      const accounts = await prisma.account.findMany({
        where: { userId: auth.id },
      });
      const a = (code: string) => accounts.find((a) => a.code === code)!.id;
      const journal = await prisma.$transaction((tx) =>
        postJournal(tx, auth.id, {
          requestKey: crypto.randomUUID(),
          date: "2026-09-01",
          memo: "開始残高",
          lines: [
            { accountId: a("110"), debit: 50000, credit: 0 },
            { accountId: a("300"), debit: 0, credit: 50000 },
          ],
        }),
      );
      journalId = journal.id;
    });
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });
    it("uses JST invoice dates, excludes drafts, isolates owners and does not double count settlement", async () => {
      const r = await managementReport(ids[0], filters, "2026-10-03");
      expect(r.customers[0].amount).toBe(10000);
      expect(r.products[0].amount).toBe(10000);
      expect(r.ledger.months.map((m) => m.revenue)).toEqual([0, 11000]);
      expect(r.ledger.cost).toBe(3300);
      expect(r.receipts[0].amount).toBe(9979);
      expect(r.receipts[0].due).toBe("2026-10-31");
      expect(r.cashflow.months[0].balance).toBe(56679);
      expect((await managementReport(ids[1], filters)).targets).toHaveLength(0);
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { receivedDate: new Date("2026-10-02") },
      });
      await prisma.expense.update({
        where: { id: expenseId },
        data: { paidDate: new Date("2026-10-02") },
      });
      await prisma.$transaction(async (tx) => {
        await syncInvoice(tx, ids[0], invoiceId);
        await syncExpense(tx, ids[0], expenseId);
      });
      const paid = await managementReport(ids[0], filters, "2026-10-03");
      expect(paid.receipts).toHaveLength(0);
      expect(paid.payments).toHaveLength(0);
      expect(paid.ledger.revenue).toBe(11000);
      expect(paid.ledger.cost).toBe(3300);
      expect(paid.opening).toBe(56679);
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { receivedDate: null },
      });
      await prisma.expense.update({
        where: { id: expenseId },
        data: { paidDate: null },
      });
      await prisma.$transaction(async (tx) => {
        await syncInvoice(tx, ids[0], invoiceId);
        await syncExpense(tx, ids[0], expenseId);
      });
    });
    it("prevents cross-owner metadata writes, stale edits and simultaneous saves", async () => {
      const a = {
        ...emptyAnnotation("INVOICE", invoiceId),
        department: "営業",
        office: "東京",
      };
      auth.id = ids[1];
      expect((await saveReportAnnotation(a)).ok).toBe(false);
      auth.id = ids[0];
      const results = await Promise.all([
        saveReportAnnotation(a),
        saveReportAnnotation(a),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect((await saveReportAnnotation(a)).ok).toBe(false);
      const r = await managementReport(
        ids[0],
        { ...filters, department: "営業" },
        "2026-10-03",
      );
      expect(r.ledger.revenue).toBe(11000);
      expect(r.ledger.cost).toBe(0);
      expect(r.cashflow.months[0].balance).toBeNull();
      expect(
        (await managementReport(ids[0], { ...filters, department: "__none__" }))
          .ledger.revenue,
      ).toBe(0);
    });
    it("reversals carry source classification and do not leave false departmental profit", async () => {
      const original = await prisma.journalEntry.findFirstOrThrow({
        where: { userId: ids[0], source: "INVOICE", sourceId: invoiceId },
      });
      await prisma.$transaction((tx) =>
        reverseJournal(tx, ids[0], original.id, "2026-10-01", "テスト取消"),
      );
      const r = await managementReport(ids[0], {
        ...filters,
        department: "営業",
      });
      expect(r.ledger.revenue).toBe(0);
      expect(
        (
          await saveReportAnnotation({
            ...emptyAnnotation("JOURNAL", original.id),
            department: "不正",
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await saveReportAnnotation({
            ...emptyAnnotation("JOURNAL", journalId),
            department: "管理",
          })
        ).ok,
      ).toBe(true);
    });
    it("exports only unpaid selected-period payments with complete bank data and stable string account codes", async () => {
      let r = await managementReport(
        ids[0],
        { ...filters, view: "payments" },
        "2026-10-03",
      );
      expect(() => transferRows(r)).toThrow();
      expect(
        (
          await saveReportAnnotation({
            ...emptyAnnotation("EXPENSE", expenseId),
            bankCode: "0001",
            branchCode: "001",
            bankAccountType: "1",
            bankAccountNumber: "0123456",
            bankAccountHolder: "ﾃｽﾄ",
          })
        ).ok,
      ).toBe(true);
      r = await managementReport(
        ids[0],
        { ...filters, view: "payments" },
        "2026-10-03",
      );
      const rows = transferRows(r);
      expect(rows[1]).toContain("0123456");
      expect(rows[1]).toContain(3300);
      for (const view of [
        "receipts",
        "payments",
        "revenue",
        "costs",
        "profit",
        "cash",
        "departments",
      ] as const) {
        const t = reportTable(r, view);
        expect(t.rows.every((row) => row.length === t.headers.length)).toBe(
          true,
        );
      }
      const narrow = await managementReport(ids[0], {
        from: "2026-09",
        to: "2026-09",
        view: "payments",
      });
      expect(() => transferRows(narrow)).toThrow();
    });
  },
);
