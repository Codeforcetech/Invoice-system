import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
const auth = vi.hoisted(() => ({ id: "accounting-test-a" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  initializeAccounting,
  saveJournal,
  cancelJournal,
  saveAccount,
} from "@/actions/accounting-actions";
import { accountingReport } from "@/lib/accounting/reports";
describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "accounting database",
  () => {
    beforeAll(async () => {
      await prisma.journalEntry.deleteMany({
        where: { userId: { in: ["accounting-test-a", "accounting-test-b"] } },
      });
      await purgeAudit(["accounting-test-a", "accounting-test-b"]);
      await prisma.user.deleteMany({
        where: { id: { in: ["accounting-test-a", "accounting-test-b"] } },
      });
      for (const id of ["accounting-test-a", "accounting-test-b"])
        await prisma.user.create({
          data: {
            id,
            name: "TEST",
            email: `${id}@example.test`,
            passwordHash: "no-login",
          },
        });
    });
    afterAll(async () => {
      await prisma.journalEntry.deleteMany({
        where: { userId: { in: ["accounting-test-a", "accounting-test-b"] } },
      });
      await purgeAudit(["accounting-test-a", "accounting-test-b"]);
      await prisma.user.deleteMany({
        where: { id: { in: ["accounting-test-a", "accounting-test-b"] } },
      });
      await prisma.$disconnect();
    });
    it("initializes once, isolates tenants, prevents duplicate posts and preserves reversals", async () => {
      await initializeAccounting({
        industry: "SERVICE",
        startDate: "2026-01-01",
      });
      await initializeAccounting({
        industry: "RETAIL",
        startDate: "2025-01-01",
      });
      expect(
        (
          await prisma.accountingSetting.findUnique({
            where: { userId: auth.id },
          })
        )?.industry,
      ).toBe("SERVICE");
      const accounts = await prisma.account.findMany({
        where: { userId: auth.id },
      });
      const bank = accounts.find((a) => a.code === "110")!,
        sales = accounts.find((a) => a.code === "400")!;
      const input = {
        requestKey: "71111111-1111-4111-8111-111111111111",
        date: "2026-09-01",
        memo: "sale",
        lines: [
          { accountId: bank.id, debit: 11000, credit: 0 },
          { accountId: sales.id, debit: 0, credit: 11000 },
        ],
      };
      expect(
        await saveJournal({
          ...input,
          lines: [input.lines[0], { ...input.lines[1], credit: 10000 }],
        }),
      ).toMatchObject({ ok: false });
      expect(await saveJournal({ ...input, date: "2025-12-31" })).toMatchObject(
        { ok: false },
      );
      expect(await saveJournal(input)).toMatchObject({ ok: true });
      expect(await saveJournal(input)).toMatchObject({ ok: true });
      expect(await saveJournal({ ...input, memo: "changed" })).toMatchObject({
        ok: false,
      });
      expect(
        await prisma.journalEntry.count({ where: { userId: auth.id } }),
      ).toBe(1);
      const report = await accountingReport(auth.id, {
        view: "ledger",
        from: "2026-09-02",
        to: "2026-09-30",
        accountId: bank.id,
      });
      expect(report.opening).toBe(11000);
      expect(report.balance).toBe(11000);
      const original = (await prisma.journalEntry.findFirst({
        where: { userId: auth.id },
      }))!;
      auth.id = "accounting-test-b";
      await initializeAccounting({
        industry: "RETAIL",
        startDate: "2026-01-01",
      });
      expect(await saveJournal(input)).toMatchObject({ ok: false });
      await expect(
        cancelJournal({ id: original.id, date: "2026-09-27", reason: "other" }),
      ).rejects.toThrow();
      await expect(
        accountingReport(auth.id, {
          view: "ledger",
          from: "2026-01-01",
          to: "2026-09-30",
          accountId: bank.id,
        }),
      ).rejects.toThrow();
      auth.id = "accounting-test-a";
      await expect(saveAccount({ ...bank, kind: "REVENUE" })).rejects.toThrow();
      await cancelJournal({
        id: original.id,
        date: "2026-09-27",
        reason: "訂正",
      });
      await cancelJournal({
        id: original.id,
        date: "2026-09-27",
        reason: "訂正",
      });
      const end = await accountingReport(auth.id, {
        view: "ledger",
        from: "2026-01-01",
        to: "2026-09-30",
        accountId: bank.id,
      });
      expect(end.balance).toBe(0);
      expect(end.entries).toHaveLength(2);
    });
    it("enforces balanced journals and owner relationships at the database boundary", async () => {
      const a = await prisma.account.findFirstOrThrow({
          where: { userId: "accounting-test-a" },
        }),
        b = await prisma.account.findFirstOrThrow({
          where: { userId: "accounting-test-b" },
        });
      await expect(
        prisma.journalEntry.create({
          data: {
            userId: "accounting-test-a",
            requestKey: "bad",
            date: new Date("2026-09-27"),
            memo: "bad",
            lines: {
              create: [
                { accountId: a.id, debit: 100, credit: 0 },
                { accountId: a.id, debit: 0, credit: 99 },
              ],
            },
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.journalEntry.create({
          data: {
            userId: "accounting-test-a",
            requestKey: "cross",
            date: new Date("2026-09-27"),
            memo: "bad",
            lines: {
              create: [
                { accountId: a.id, debit: 100, credit: 0 },
                { accountId: b.id, debit: 0, credit: 100 },
              ],
            },
          },
        }),
      ).rejects.toThrow();
    });
  },
);
