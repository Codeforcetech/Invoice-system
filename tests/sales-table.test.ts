import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  allocateInvoice,
  buildSalesTable,
  filterLines,
  salesTableLines,
  type SalesLine,
} from "@/lib/accounting/sales-table";
import { resolveExpenseLink } from "@/lib/stores";

const line = (over: Partial<SalesLine>): SalesLine => ({
  key: Math.random().toString(),
  kind: "SALES",
  month: "2026-01",
  date: "2026-01-10",
  companyId: "c1",
  companyName: "取引先A",
  storeId: null,
  storeName: null,
  party: "取引先A",
  content: "",
  source: "請求書",
  gross: 0,
  net: 0,
  href: null,
  ...over,
});

describe("allocateInvoice", () => {
  it("splits an invoice by store and keeps the invoice's totals exactly", () => {
    const m = allocateInvoice({ subtotal: 301, taxAmount: 30, taxRate: 1000 }, [
      { amount: 101, taxCategory: null, storeId: "a" },
      { amount: 100, taxCategory: null, storeId: "b" },
      { amount: 100, taxCategory: "EXEMPT", storeId: "b" },
    ]);
    const net = [...m.values()].reduce((n, v) => n + v.net, 0);
    const tax = [...m.values()].reduce((n, v) => n + v.tax, 0);
    expect(net).toBe(301);
    expect(tax).toBe(30);
    expect(m.get("a")!.net).toBe(101);
    expect(m.get("b")!.net).toBe(200);
  });
  it("puts an invoice without items under no store", () => {
    expect(
      allocateInvoice(
        { subtotal: 1000, taxAmount: 100, taxRate: 1000 },
        [],
      ).get(null),
    ).toEqual({ net: 1000, tax: 100 });
  });
});

describe("buildSalesTable", () => {
  const companies = [
    {
      id: "c1",
      name: "取引先A",
      stores: [
        { id: "s1", name: "店舗A", active: true },
        { id: "s2", name: "店舗B", active: true },
        { id: "s3", name: "旧店舗", active: false },
      ],
    },
    { id: "c2", name: "取引先B", stores: [] },
    { id: "c3", name: "何もない取引先", stores: [] },
  ];
  const lines = [
    line({ storeId: "s1", gross: 1100, net: 1000 }),
    line({ storeId: "s1", month: "2026-03", gross: 550, net: 500 }),
    line({ kind: "COST", storeId: "s2", gross: 220, net: 200 }),
    line({ companyId: "c2", companyName: "取引先B", gross: 330, net: 300 }),
    line({ companyId: null, kind: "COST", gross: 77, net: 70 }),
  ];
  const t = buildSalesTable(lines, companies, "gross");

  it("makes one block per company that has data or stores, and one for unassigned", () => {
    expect(t.blocks.map((b) => b.name)).toEqual([
      "取引先A",
      "取引先B",
      "取引先の指定なし",
    ]);
  });
  it("shows sales and cost rows per active store, with subtotals", () => {
    const a = t.blocks[0].rows;
    expect(a.map((r) => `${r.label}:${r.kind}`)).toEqual([
      "店舗A:SALES",
      "店舗A:COST",
      "店舗B:SALES",
      "店舗B:COST",
      "小計:SALES",
      "小計:COST",
    ]);
    expect(a[0].months[0]).toBe(1100);
    expect(a[0].months[2]).toBe(550);
    expect(a[0].total).toBe(1650);
    expect(a[3].total).toBe(220);
    expect(a[4].total).toBe(1650);
  });
  it("a company without stores gets just a sales row and a cost row", () => {
    expect(t.blocks[1].rows).toHaveLength(2);
    expect(t.blocks[1].rows[0].total).toBe(330);
  });
  it("totals add up across everything", () => {
    const [sales, cost, profit] = t.totals;
    expect(sales.total).toBe(1980);
    expect(cost.total).toBe(297);
    expect(profit.total).toBe(1683);
  });
  it("can show the tax-excluded amounts", () => {
    expect(buildSalesTable(lines, companies, "net").totals[0].total).toBe(1800);
  });
  it("drill-down returns exactly the lines behind a cell", () => {
    const cell = t.blocks[0].rows[0];
    const picked = filterLines(lines, { month: "2026-01", ...cell.scope });
    expect(picked.reduce((n, l) => n + l.gross, 0)).toBe(cell.months[0]);
    const year = filterLines(lines, { month: "", ...cell.scope });
    expect(year.reduce((n, l) => n + l.gross, 0)).toBe(cell.total);
    const sub = t.blocks[0].rows[4];
    expect(
      filterLines(lines, { month: "", ...sub.scope }).reduce(
        (n, l) => n + l.gross,
        0,
      ),
    ).toBe(sub.total);
  });
});

const owner = "st-test-owner",
  other = "st-test-other",
  users = [owner, other];
const ws = { ownerId: owner, userId: owner };

async function cleanup() {
  await prisma.invoice.deleteMany({ where: { createdById: { in: users } } });
  await prisma.expense.deleteMany({ where: { userId: { in: users } } });
  await prisma.company.deleteMany({ where: { userId: { in: users } } });
  await purgeAudit(users);
  await prisma.journalEntry.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "salesTableLines (database)",
  () => {
    let companyId = "",
      storeA = "",
      storeB = "",
      otherStore = "";
    beforeAll(async () => {
      await cleanup();
      for (const id of users)
        await prisma.user.create({
          data: {
            id,
            name: id,
            email: id + "@example.test",
            passwordHash: "x",
          },
        });
      const c = await prisma.company.create({
        data: { name: "A社", invoiceCode: "A", userId: owner },
      });
      companyId = c.id;
      storeA = (
        await prisma.store.create({ data: { companyId, name: "店舗A" } })
      ).id;
      storeB = (
        await prisma.store.create({ data: { companyId, name: "店舗B" } })
      ).id;
      const oc = await prisma.company.create({
        data: { name: "他人の会社", invoiceCode: "O", userId: other },
      });
      otherStore = (
        await prisma.store.create({ data: { companyId: oc.id, name: "X" } })
      ).id;
      await prisma.invoice.create({
        data: {
          invoiceNumber: "ST-1",
          companyId,
          subject: "1月分",
          issueDate: new Date("2026-01-31"),
          dueDate: new Date("2026-02-28"),
          taxRate: 1000,
          subtotal: 300000,
          taxAmount: 30000,
          totalWithTax: 330000,
          withholdingTax: 0,
          grandTotal: 330000,
          status: "ISSUED",
          receivedDate: new Date("2026-02-10"),
          createdById: owner,
          items: {
            create: [
              {
                sortOrder: 1,
                productName: "A",
                quantity: 1,
                unitPrice: 100000,
                amount: 100000,
                storeId: storeA,
              },
              {
                sortOrder: 2,
                productName: "B",
                quantity: 1,
                unitPrice: 200000,
                amount: 200000,
                storeId: storeB,
              },
            ],
          },
        },
      });
      await prisma.expense.create({
        data: {
          userId: owner,
          supplier: "仕入先",
          description: "資材",
          category: "仕入",
          amount: 11000,
          taxCategory: "TAXABLE_10",
          costMonth: "2026-02",
          dueDate: new Date("2026-02-28"),
          paidDate: new Date("2026-02-20"),
          companyId,
          storeId: storeA,
        },
      });
      await prisma.expense.create({
        data: {
          userId: owner,
          supplier: "指定なし",
          description: "雑費",
          category: "その他",
          amount: 500,
          costMonth: "2026-02",
          dueDate: new Date("2026-02-28"),
          paidDate: new Date("2026-02-21"),
        },
      });
    });
    afterAll(cleanup);

    it("splits sales by item store and ties out to the invoice", async () => {
      const lines = await salesTableLines(prisma, ws, "2026", "paid");
      const sales = lines.filter((l) => l.kind === "SALES");
      expect(sales.map((l) => [l.storeName, l.month, l.gross]).sort()).toEqual([
        ["店舗A", "2026-02", 110000],
        ["店舗B", "2026-02", 220000],
      ]);
      expect(sales.reduce((n, l) => n + l.net, 0)).toBe(300000);
    });
    it("puts costs under their company and store, or under unassigned", async () => {
      const lines = await salesTableLines(prisma, ws, "2026", "paid");
      const costs = lines.filter((l) => l.kind === "COST");
      expect(costs.find((l) => l.content === "資材")).toMatchObject({
        companyId,
        storeName: "店舗A",
        gross: 11000,
      });
      expect(costs.find((l) => l.content === "雑費")?.companyId).toBeNull();
    });
    it("does not leak another workspace's data", async () => {
      const lines = await salesTableLines(
        prisma,
        { ownerId: other, userId: other },
        "2026",
        "paid",
      );
      expect(lines).toEqual([]);
    });
    it("only accepts the owner's own company and stores for a payment", async () => {
      await expect(
        resolveExpenseLink(prisma, owner, null, otherStore),
      ).rejects.toThrow("STORE_INVALID");
      await expect(
        resolveExpenseLink(prisma, owner, "someone-else", storeA),
      ).rejects.toThrow("STORE_INVALID");
      await expect(
        resolveExpenseLink(prisma, owner, null, storeA),
      ).resolves.toEqual({ companyId, storeId: storeA });
      await expect(
        resolveExpenseLink(prisma, owner, null, null),
      ).resolves.toEqual({ companyId: null, storeId: null });
    });
  },
);
