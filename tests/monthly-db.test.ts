import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  accountingLock,
  postJournal,
  reverseJournal,
} from "@/lib/accounting/service";
import {
  monthTotals,
  monthlyRows,
  partyTotals,
  pendingInvoices,
  yearMonths,
} from "@/lib/accounting/monthly";

const owner = "mon-test-owner",
  member = "mon-test-member",
  other = "mon-test-other",
  users = [owner, member, other];
const ws = { ownerId: owner, userId: owner };
const bytes = new Uint8Array([37, 80, 68, 70]);

async function cleanup() {
  await prisma.claimEvent.deleteMany({ where: { actorId: { in: users } } });
  await prisma.expenseClaim.deleteMany({ where: { ownerId: owner } });
  await prisma.claimWorkspace.deleteMany({ where: { ownerId: owner } });
  await prisma.invoice.deleteMany({ where: { createdById: { in: users } } });
  await prisma.company.deleteMany({ where: { userId: { in: users } } });
  await prisma.journalEntry.deleteMany({ where: { userId: { in: users } } });
  await purgeAudit(users);
  await prisma.expense.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe("pure helpers", () => {
  const row = (
    kind: "SALES" | "COST",
    month: string,
    party: string,
    gross: number,
    net: number,
  ) => ({
    key: party + month + gross,
    kind,
    date: month + "-10",
    month,
    party,
    content: "",
    source: "",
    gross,
    tax: gross - net,
    net,
    taxUnknown: false,
    href: null,
  });
  it("totals per month in the chosen tax mode, and per party across spelling variants", () => {
    const rows = [
      row("SALES", "2026-09", "A社", 1100, 1000),
      row("COST", "2026-09", "山田 太郎", 550, 500),
      row("COST", "2026-09", "山田　太郎", 220, 200),
      row("SALES", "2026-10", "B社", 330, 300),
    ];
    expect(
      monthTotals(rows, ["2026-09", "2026-10", "2026-11"], "gross"),
    ).toEqual([
      { month: "2026-09", sales: 1100, cost: 770, profit: 330 },
      { month: "2026-10", sales: 330, cost: 0, profit: 330 },
      { month: "2026-11", sales: 0, cost: 0, profit: 0 },
    ]);
    expect(monthTotals(rows, ["2026-09"], "net")[0]).toMatchObject({
      sales: 1000,
      cost: 700,
    });
    expect(
      partyTotals(
        rows.filter((r) => r.kind === "COST"),
        "gross",
      ),
    ).toEqual([{ party: "山田 太郎", amount: 770, count: 2 }]);
  });
  it("lists the twelve months of the year", () => {
    expect(yearMonths("2026-09")[0]).toBe("2026-01");
    expect(yearMonths("2026-09")).toHaveLength(12);
  });
});

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "monthlyRows",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of users)
        await prisma.user.create({
          data: {
            id,
            name: id === member ? "山田太郎" : id,
            email: id + "@example.test",
            passwordHash: "no-login",
          },
        });
      const company = await prisma.company.create({
        data: { name: "A社", invoiceCode: "A", userId: owner },
      });
      const inv = (n: string, over: Record<string, unknown>) =>
        prisma.invoice.create({
          data: {
            invoiceNumber: n,
            companyId: company.id,
            subject: "9月分",
            issueDate: new Date("2026-08-31"),
            dueDate: new Date("2026-09-30"),
            taxRate: 1000,
            subtotal: 100000,
            taxAmount: 10000,
            totalWithTax: 110000,
            withholdingTax: 0,
            grandTotal: 110000,
            status: "ISSUED",
            createdById: owner,
            ...over,
          },
        });
      await inv("MON-1", { receivedDate: new Date("2026-09-20") }); // 発行は8月、入金は9月 → 9月の売上
      await inv("MON-2", {}); // 入金待ち
      await inv("MON-3", {
        status: "DRAFT",
        receivedDate: new Date("2026-09-21"),
      }); // 下書きは入れない
      await prisma.expense.create({
        data: {
          userId: owner,
          supplier: "佐藤デザイン",
          description: "8月分",
          category: "業務委託報酬",
          amount: 55000,
          taxCategory: "TAXABLE_10",
          costMonth: "2026-08",
          dueDate: new Date("2026-08-31"),
          paidDate: new Date("2026-09-10"),
          note: "",
        },
      });
      await prisma.expense.create({
        data: {
          userId: owner,
          supplier: "未払いの店",
          description: "9月分",
          category: "その他",
          amount: 1100,
          costMonth: "2026-09",
          dueDate: new Date("2026-09-30"),
          note: "",
        },
      });
      await prisma.accountingSetting.create({
        data: {
          userId: owner,
          startDate: new Date("2026-01-01"),
          industry: "SERVICE",
        },
      });
      const acc = async (code: string, name: string, kind: string) =>
        (
          await prisma.account.create({
            data: { userId: owner, code, name, kind },
          })
        ).id;
      const bank = await acc("110", "普通預金", "ASSET"),
        sales = await acc("400", "売上高", "REVENUE"),
        fee = await acc("570", "支払手数料", "EXPENSE");
      await prisma.$transaction(async (tx) => {
        await accountingLock(tx, owner);
        await postJournal(
          tx,
          owner,
          {
            requestKey: crypto.randomUUID(),
            date: "2026-09-12",
            memo: "現金売上",
            lines: [
              { accountId: bank, debit: 3300, credit: 0 },
              {
                accountId: sales,
                debit: 0,
                credit: 3300,
                taxCategory: "TAXABLE_10",
              },
            ],
          },
          "MANUAL",
        );
        await postJournal(
          tx,
          owner,
          {
            requestKey: crypto.randomUUID(),
            date: "2026-09-13",
            memo: "振込手数料",
            lines: [
              {
                accountId: fee,
                debit: 440,
                credit: 0,
                taxCategory: "TAXABLE_10",
              },
              { accountId: bank, debit: 0, credit: 440 },
            ],
          },
          "MANUAL",
        );
        const wrong = await postJournal(
          tx,
          owner,
          {
            requestKey: crypto.randomUUID(),
            date: "2026-09-14",
            memo: "取り消す記録",
            lines: [
              { accountId: fee, debit: 999, credit: 0 },
              { accountId: bank, debit: 0, credit: 999 },
            ],
          },
          "MANUAL",
        );
        await reverseJournal(tx, owner, wrong.id, "2026-09-14", "誤り");
        await postJournal(
          tx,
          owner,
          {
            requestKey: crypto.randomUUID(),
            date: "2026-09-15",
            memo: "SLACK T09T9RSBE7R",
            lines: [
              { accountId: fee, debit: 2198, credit: 0 },
              { accountId: bank, debit: 0, credit: 2198 },
            ],
          },
          "STATEMENT",
        );
      });
      await prisma.claimWorkspace.create({
        data: { ownerId: owner, name: "精算先" },
      });
      await prisma.claimMember.create({
        data: { ownerId: owner, userId: member, role: "SUBMITTER" },
      });
      const claim = (
        id: string,
        status: string,
        over: Record<string, unknown> = {},
      ) =>
        prisma.expenseClaim.create({
          data: {
            id,
            ownerId: owner,
            applicantId: member,
            title: "交通費",
            merchant: "テスト鉄道",
            date: new Date("2026-09-05"),
            amount: 1200,
            category: "交通費",
            note: "",
            status,
            ...over,
            receipt: {
              create: {
                filename: "r.pdf",
                mimeType: "application/pdf",
                data: bytes,
              },
            },
          },
        });
      // 支払済みの経費精算には、承認時と精算時の仕訳が結びついている。
      const link = await prisma.$transaction(async (tx) => {
        const a = await postJournal(
          tx,
          owner,
          {
            requestKey: crypto.randomUUID(),
            date: "2026-09-05",
            memo: "経費精算",
            lines: [
              { accountId: fee, debit: 1200, credit: 0 },
              { accountId: bank, debit: 0, credit: 1200 },
            ],
          },
          "CLAIM",
        );
        const b = await postJournal(
          tx,
          owner,
          {
            requestKey: crypto.randomUUID(),
            date: "2026-10-05",
            memo: "経費精算の支払",
            lines: [
              { accountId: bank, debit: 1200, credit: 0 },
              { accountId: fee, debit: 0, credit: 1200 },
            ],
          },
          "CLAIM_PAYMENT",
        );
        return { entryId: a.id, paymentEntryId: b.id };
      });
      await claim("33333333-3333-4333-8333-333333333333", "PAID", {
        paidDate: new Date("2026-10-05"),
        ...link,
      }); // 発生は9月、支払は10月
      await claim("44444444-4444-4444-8444-444444444444", "PENDING"); // 承認前は入れない
    });
    afterAll(cleanup);

    const by = (rows: Awaited<ReturnType<typeof monthlyRows>>, party: string) =>
      rows.find((r) => r.party === party)!;

    it("counts sales in the month the money came in, with the real tax split", async () => {
      const rows = await monthlyRows(prisma, ws, "2026-09", "2026-09", "paid");
      expect(by(rows, "A社")).toMatchObject({
        kind: "SALES",
        date: "2026-09-20",
        gross: 110000,
        tax: 10000,
        net: 100000,
        source: "請求書",
      });
      expect(
        rows
          .filter((r) => r.kind === "SALES")
          .map((r) => r.party)
          .sort(),
      ).toEqual(["A社", "現金売上"]);
      expect(by(rows, "現金売上")).toMatchObject({
        gross: 3300,
        tax: 300,
        net: 3000,
        source: "手入力・明細取込",
      });
    });
    it("counts costs in the month paid, leaving out unpaid and unapproved ones", async () => {
      const rows = await monthlyRows(prisma, ws, "2026-09", "2026-09", "paid");
      const costs = rows
        .filter((r) => r.kind === "COST")
        .map((r) => r.party)
        .sort();
      expect(costs).toEqual([
        "SLACK T09T9RSBE7R",
        "佐藤デザイン",
        "振込手数料",
      ]);
      expect(by(rows, "佐藤デザイン")).toMatchObject({
        gross: 55000,
        tax: 5000,
        net: 50000,
        date: "2026-09-10",
      });
      expect(by(rows, "振込手数料")).toMatchObject({ gross: 440, net: 400 });
    });
    it("counts costs in the month they arose when asked", async () => {
      const rows = await monthlyRows(
        prisma,
        ws,
        "2026-09",
        "2026-09",
        "incurred",
      );
      const costs = rows.filter((r) => r.kind === "COST");
      expect(costs.map((r) => r.party).sort()).toEqual(
        ["SLACK T09T9RSBE7R", "テスト鉄道", "未払いの店", "振込手数料"].sort(),
      );
      expect(by(rows, "テスト鉄道")).toMatchObject({
        gross: 1200,
        taxUnknown: true,
        net: 1200,
        source: "経費精算",
      });
      expect(by(rows, "未払いの店").taxUnknown).toBe(true);
      // 8月分の業務委託報酬は、発生は8月。
      expect(
        (await monthlyRows(prisma, ws, "2026-08", "2026-08", "incurred")).map(
          (r) => r.party,
        ),
      ).toContain("佐藤デザイン");
    });
    it("puts a claim in the month it was paid under the paid basis", async () => {
      expect(
        (await monthlyRows(prisma, ws, "2026-10", "2026-10", "paid")).map(
          (r) => r.party,
        ),
      ).toContain("テスト鉄道");
    });
    it("ignores cancelled manual entries and never shows other workspaces", async () => {
      const rows = await monthlyRows(prisma, ws, "2026-09", "2026-09", "paid");
      expect(rows.some((r) => r.party === "取り消す記録")).toBe(false);
      expect(
        await monthlyRows(
          prisma,
          { ownerId: other, userId: other },
          "2026-01",
          "2026-12",
          "paid",
        ),
      ).toEqual([]);
    });
    it("reports unpaid invoices separately, and hides claims from people who may not see them", async () => {
      expect(await pendingInvoices(prisma, ws, "2026-09")).toEqual({
        count: 1,
        gross: 110000,
        net: 100000,
      });
      const rows = await monthlyRows(
        prisma,
        { ownerId: owner, userId: other },
        "2026-09",
        "2026-09",
        "incurred",
      );
      expect(rows.some((r) => r.source === "経費精算")).toBe(false);
    });
  },
);
