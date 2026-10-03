import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "taxjnl-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  cancelJournal,
  initializeAccounting,
  saveJournal,
} from "@/actions/accounting-actions";
import {
  createInvoice,
  getInvoice,
  updateInvoice,
} from "@/actions/invoice-actions";
import { importAccountingSource } from "@/actions/accounting-link-actions";
import { saveExpense, getExpense } from "@/actions/expense-actions";
import { accountingReport } from "@/lib/accounting/reports";

const owner = "taxjnl-test-owner";
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
const input = (items: ReturnType<typeof line>[], status = "ISSUED") => ({
  companyId: "taxjnl-company",
  subject: "税区分の仕訳",
  issueDate: new Date("2026-09-10"),
  dueDate: new Date("2026-09-30"),
  status,
  withholdingEnabled: false,
  items,
});
/** Sales lines of one invoice, including reversal lines (they keep the source id). */
const salesLines = (sourceId: string) =>
  prisma.journalLine.findMany({
    where: { userId: owner, account: { code: "400" }, entry: { sourceId } },
    include: { entry: true },
    orderBy: { credit: "desc" },
  });
const netByCategory = (
  lines: { taxCategory: string | null; debit: number; credit: number }[],
  side: "credit" | "debit",
) => {
  const net = new Map<string | null, number>();
  for (const l of lines)
    net.set(
      l.taxCategory,
      (net.get(l.taxCategory) ?? 0) +
        (side === "credit" ? l.credit - l.debit : l.debit - l.credit),
    );
  return net;
};
const report = (view = "tax") =>
  accountingReport(owner, {
    view,
    from: "2026-09-01",
    to: "2026-09-30",
    accountId: "",
  });
const find = (rows: (string | number)[][], side: string, label: string) =>
  rows.find((r) => r[0] === side && r[1] === label);

async function cleanup() {
  await prisma.journalEntry.deleteMany({ where: { userId: owner } });
  await prisma.accountingSource.deleteMany({ where: { userId: owner } });
  await prisma.invoice.deleteMany({ where: { createdById: owner } });
  await prisma.expense.deleteMany({ where: { userId: owner } });
  await purgeAudit([owner]);
  await prisma.account.deleteMany({ where: { userId: owner } });
  await prisma.accountingSetting.deleteMany({ where: { userId: owner } });
  await prisma.company.deleteMany({ where: { userId: owner } });
  await prisma.systemSetting.deleteMany({ where: { userId: owner } });
  await prisma.user.deleteMany({ where: { id: owner } });
}

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "tax categories in the books",
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
          id: "taxjnl-company",
          userId: owner,
          name: "税区分仕訳株式会社",
          invoiceCode: "TJ",
        },
      });
      await initializeAccounting({
        industry: "SERVICE",
        startDate: "2026-01-01",
      });
    });
    afterAll(cleanup);

    it("tags the sales of an invoice without categories with the invoice's own rate, in a single line", async () => {
      const c = await createInvoice(input([line("A", 10000), line("B", 1000)]));
      expect(
        (await salesLines(c.id)).map((l) => [l.credit, l.taxCategory]),
      ).toEqual([[12100, "TAXABLE_10"]]);
    });

    it("splits the sales of a categorized invoice by tax group and keeps the total", async () => {
      const c = await createInvoice(
        input([
          line("標準", 1001, "TAXABLE_10"),
          line("軽減", 999, "TAXABLE_8"),
          line("保険", 500, "EXEMPT"),
        ]),
      );
      const lines = await salesLines(c.id);
      expect(lines.map((l) => [l.credit, l.taxCategory]).sort()).toEqual(
        [
          [1101, "TAXABLE_10"],
          [1078, "TAXABLE_8"],
          [500, "EXEMPT"],
        ].sort(),
      );
      expect(lines.reduce((s, l) => s + l.credit, 0)).toBe(2679);
      const receivable = await prisma.journalLine.findFirstOrThrow({
        where: {
          userId: owner,
          account: { code: "120" },
          entry: { sourceId: c.id },
        },
      });
      expect(receivable.debit).toBe(2679);
      expect(receivable.taxCategory).toBeNull();
    });

    it("does not repost an invoice that was posted before categories existed", async () => {
      const c = await createInvoice(input([line("旧", 20000)]));
      const src = await prisma.accountingSource.findFirstOrThrow({
        where: { userId: owner, key: `invoice:${c.id}:issue` },
      });
      // The fingerprint is exactly what the previous version stored: no tax data in it.
      const inv = await getInvoice({ invoiceId: c.id });
      const legacyPosting = {
        date: "2026-09-10",
        memo: `請求: ${inv.invoiceNumber} 税区分仕訳株式会社 税区分の仕訳`,
        lines: [
          { code: "120", debit: 22000, credit: 0 },
          { code: "400", debit: 0, credit: 22000 },
        ],
      };
      expect(src.fingerprint).toBe(
        createHash("sha256")
          .update(JSON.stringify(legacyPosting))
          .digest("hex"),
      );
      // Emulate the old entry (no category) and sync again: nothing is reversed or posted.
      await prisma.journalLine.updateMany({
        where: { userId: owner, entryId: src.entryId! },
        data: { taxCategory: null },
      });
      const before = await prisma.journalEntry.count({
        where: { userId: owner },
      });
      await importAccountingSource({
        type: "invoice",
        id: c.id,
        version: inv.updatedAt.toISOString(),
      });
      expect(
        await prisma.journalEntry.count({ where: { userId: owner } }),
      ).toBe(before);
      expect((await salesLines(c.id))[0].taxCategory).toBeNull();
    });

    it("reposts when categories are added; the reversal offsets the old lines category by category", async () => {
      const c = await createInvoice(input([line("A", 1001), line("B", 999)]));
      await updateInvoice({
        invoiceId: c.id,
        data: input([
          line("A", 1001, "TAXABLE_10"),
          line("B", 999, "TAXABLE_8"),
        ]),
      });
      const all = await salesLines(c.id);
      // The first posting took TAXABLE_10 from the invoice's rate; the reversal cancels it exactly.
      expect([...netByCategory(all, "credit").entries()].sort()).toEqual(
        [
          ["TAXABLE_10", 1101],
          ["TAXABLE_8", 1078],
        ].sort(),
      );
      expect(all.some((l) => l.entry.source === "REVERSAL")).toBe(true);
    });

    it("keeps the category of a payment's cost line, reposts when it changes, and leaves 'not set' alone", async () => {
      const id = "88111111-1111-4111-8111-111111111111";
      const form = (version?: string, taxCategory = "TAXABLE_10") => {
        const f = new FormData();
        for (const [k, v] of Object.entries({
          id,
          supplier: "仕入先",
          description: "商品",
          category: "仕入",
          taxCategory,
          amount: "5500",
          costMonth: "2026-09",
          dueDate: "2026-09-30",
          paidDate: "",
          note: "",
          ...(version ? { version } : {}),
        }))
          f.set(k, v);
        return f;
      };
      const costLines = () =>
        prisma.journalLine.findMany({
          where: {
            userId: owner,
            account: { code: "500" },
            entry: { sourceId: id },
          },
        });
      expect(await saveExpense(form())).toMatchObject({ ok: true });
      expect((await costLines()).map((l) => l.taxCategory)).toEqual([
        "TAXABLE_10",
      ]);
      expect((await getExpense(id))?.taxCategory).toBe("TAXABLE_10");

      expect(
        await saveExpense(form((await getExpense(id))!.version, "TAXABLE_8")),
      ).toMatchObject({ ok: true });
      let net = netByCategory(await costLines(), "debit");
      expect(net.get("TAXABLE_10")).toBe(0);
      expect(net.get("TAXABLE_8")).toBe(5500);

      expect(
        await saveExpense(form((await getExpense(id))!.version, "")),
      ).toMatchObject({ ok: true });
      expect((await getExpense(id))?.taxCategory).toBeNull();
      net = netByCategory(await costLines(), "debit");
      expect(net.get("TAXABLE_8")).toBe(0);
      expect(net.get(null)).toBe(5500);
    });

    it("stores categories from a manual journal, accepts 'not set' as an empty choice, and rejects an unknown one", async () => {
      const [cash, sales] = await Promise.all(
        ["100", "400"].map((code) =>
          prisma.account.findFirstOrThrow({ where: { userId: owner, code } }),
        ),
      );
      const entry = (taxCategory: string | null, memo: string) => ({
        requestKey: crypto.randomUUID(),
        date: "2026-09-15",
        memo,
        lines: [
          { accountId: cash.id, debit: 3300, credit: 0 },
          { accountId: sales.id, debit: 0, credit: 3300, taxCategory },
        ],
      });
      expect(await saveJournal(entry("TAXABLE_10", "区分あり"))).toMatchObject({
        ok: true,
      });
      expect(await saveJournal(entry("", "区分は空欄"))).toMatchObject({
        ok: true,
      });
      expect(await saveJournal(entry("TAXABLE_5", "不正"))).toMatchObject({
        ok: false,
      });
      const e = await prisma.journalEntry.findFirstOrThrow({
        where: { userId: owner, memo: "区分あり" },
        include: { lines: true },
      });
      expect(e.lines.map((l) => l.taxCategory).sort()).toEqual(
        [null, "TAXABLE_10"].sort(),
      );
      const blank = await prisma.journalEntry.findFirstOrThrow({
        where: { userId: owner, memo: "区分は空欄" },
        include: { lines: true },
      });
      expect(blank.lines.every((l) => l.taxCategory === null)).toBe(true);
      // Cancelling the tagged one offsets its category too.
      await cancelJournal({ id: e.id, date: "2026-09-16", reason: "テスト" });
      const reversal = await prisma.journalLine.findMany({
        where: { userId: owner, entry: { reversalOf: e.id } },
      });
      expect(reversal.map((l) => l.taxCategory).sort()).toEqual(
        [null, "TAXABLE_10"].sort(),
      );
    });

    it("the database rejects an unknown category on a journal line and on a payment", async () => {
      const [a, b] = await Promise.all(
        ["100", "400"].map((code) =>
          prisma.account.findFirstOrThrow({ where: { userId: owner, code } }),
        ),
      );
      const entry = (taxCategory: string) =>
        prisma.journalEntry.create({
          data: {
            userId: owner,
            requestKey: crypto.randomUUID(),
            date: new Date("2026-09-01"),
            memo: "制約",
            lines: {
              create: [
                { accountId: a.id, debit: 1 },
                { accountId: b.id, credit: 1, taxCategory },
              ],
            },
          },
        });
      await expect(entry("TAXABLE_5")).rejects.toThrow(
        /JournalLine_taxCategory_check|check constraint/,
      );
      await expect(entry("TAXABLE_10")).resolves.toBeDefined();
      await expect(
        prisma.expense.create({
          data: {
            userId: owner,
            supplier: "x",
            description: "x",
            category: "仕入",
            amount: 1,
            costMonth: "2026-09",
            dueDate: new Date("2026-09-30"),
            taxCategory: "BAD",
          },
        }),
      ).rejects.toThrow();
    });

    it("builds the summary from the books", async () => {
      const { rows, headers, title } = await report();
      expect(title).toBe("消費税区分別集計");
      expect(headers).toEqual([
        "種別",
        "消費税区分",
        "税込金額",
        "税抜金額",
        "消費税額",
      ]);
      // 10%: 12,100 (first invoice) + 1,101 (categorized) + 1,101 (re-posted) + 3,300 (manual) + 1 (constraint
      // test entry) − 3,300 (the cancelled manual entry) = 14,303.
      const s10 = find(rows, "売上", "課税（10%）")!;
      expect(s10.slice(2)).toEqual([14303, 13003, 1300]);
      // Reduced rate: two invoices of 1,078. Backing tax out of the 2,156 total gives 159 (each invoice
      // stated 79, so 158): the report is a reference value, as its note says.
      expect(find(rows, "売上", "課税（軽減8%）")!.slice(2)).toEqual([
        2156, 1997, 159,
      ]);
      expect(find(rows, "売上", "非課税")!.slice(2)).toEqual([500, 500, 0]);
      expect(find(rows, "売上", "区分ありの合計")!.slice(2)).toEqual([
        14303 + 2156 + 500,
        13003 + 1997 + 500,
        1300 + 159,
      ]);
      // The invoice whose line was emptied to emulate an old posting, and the manual entry saved without a choice.
      expect(find(rows, "売上", "未設定（区分を指定していない取引）")![2]).toBe(
        22000 + 3300,
      );
      // The payment ended up without a category; its categorized postings were reversed and net to zero.
      expect(
        find(rows, "仕入・経費", "未設定（区分を指定していない取引）")![2],
      ).toBe(5500);
      expect(find(rows, "仕入・経費", "課税（10%）")!.slice(2)).toEqual([
        0, 0, 0,
      ]);
      expect(find(rows, "仕入・経費", "課税（軽減8%）")!.slice(2)).toEqual([
        0, 0, 0,
      ]);
    });

    it("adds the category to the journal and transaction exports", async () => {
      const { rows, headers } = await report("transactions");
      expect(headers.at(-1)).toBe("消費税区分");
      expect(rows.some((r) => r.at(-1) === "課税（10%）")).toBe(true);
      expect(rows.every((r) => r.length === headers.length)).toBe(true);
    });
  },
);
