import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const auth = vi.hoisted(() => ({ id: "statements-test-a" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import {
  initializeAccounting,
  saveJournal,
} from "@/actions/accounting-actions";
import {
  createStatementFeed,
  previewStatements,
  importStatements,
  decideStatement,
  updateStatementRule,
} from "@/actions/statement-actions";
import type { CsvMapping } from "@/lib/accounting/statement-csv";
const mapping: CsvMapping = {
  date: 0,
  description: 1,
  mode: "split",
  incoming: 2,
  outgoing: 3,
  amount: -1,
  reference: 4,
};
function ok<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
let feedId: string, bank: string, cost: string, otherCost: string, card: string;
const raw = (line: string, extra = {}) => ({
  feedId,
  text: "日付,摘要,入金,出金,明細ID\n" + line,
  mapping,
  fileName: "test.csv",
  allowAutomatic: false,
  ...extra,
});
const getRow = (reference: string) =>
  prisma.statementRow.findFirstOrThrow({
    where: { userId: "statements-test-a", reference },
  });
async function cleanup() {
  await prisma.statementFeed.deleteMany({
    where: { userId: { in: ["statements-test-a", "statements-test-b"] } },
  });
  await prisma.journalEntry.deleteMany({
    where: { userId: { in: ["statements-test-a", "statements-test-b"] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: ["statements-test-a", "statements-test-b"] } },
  });
}
describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "statement integration",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of ["statements-test-a", "statements-test-b"]) {
        await prisma.user.create({
          data: {
            id,
            name: "TEST",
            email: id + "@example.test",
            passwordHash: "no-login",
          },
        });
        auth.id = id;
        await initializeAccounting({
          industry: "SERVICE",
          startDate: "2026-01-01",
        });
      }
      auth.id = "statements-test-a";
      const acc = await prisma.account.findMany({ where: { userId: auth.id } });
      bank = acc.find((a) => a.code === "110")!.id;
      cost = acc.find((a) => a.code === "530")!.id;
      otherCost = acc.find((a) => a.code === "560")!.id;
      card = acc.find((a) => a.code === "210")!.id;
      feedId = ok(
        await createStatementFeed({
          name: "テスト銀行",
          kind: "BANK",
          accountId: bank,
        }),
      );
    });
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });
    it("previews without persisting, imports once even with concurrent requests", async () => {
      const v = raw("2026-09-01,クラウド利用料,0,3300,bank-1");
      expect(ok(await previewStatements(v))[0]).toMatchObject({
        duplicate: false,
        amount: -3300,
        suggestion: null,
      });
      expect(
        await prisma.statementRow.count({ where: { userId: auth.id } }),
      ).toBe(0);
      const results = await Promise.all([
        importStatements(v),
        importStatements(v),
      ]);
      expect(results.map((r) => ok(r).imported).sort()).toEqual([0, 1]);
      expect(
        await prisma.journalEntry.count({ where: { userId: auth.id } }),
      ).toBe(0);
      expect(ok(await previewStatements(v))[0].duplicate).toBe(true);
    });
    it("rejects switching duplicate detection modes for an existing feed", async () => {
      const result = await importStatements(
        raw("2026-09-01,クラウド利用料,0,3300,bank-1", {
          mapping: { ...mapping, reference: -1 },
        }),
      );
      expect(result.ok).toBe(false);
      expect(
        await prisma.statementRow.count({ where: { userId: auth.id } }),
      ).toBe(1);
    });
    it("approval creates a balanced entry and learns a suggestion-only rule", async () => {
      const row = await getRow("bank-1");
      ok(
        await decideStatement({
          id: row.id,
          version: row.updatedAt.toISOString(),
          action: "approve",
          counterAccountId: cost,
          learn: true,
        }),
      );
      const saved = await getRow("bank-1"),
        entry = await prisma.journalEntry.findUniqueOrThrow({
          where: { id: saved.entryId! },
          include: { lines: true },
        });
      expect(entry.lines.reduce((a, l) => a + l.debit - l.credit, 0)).toBe(0);
      expect(entry.lines.find((l) => l.accountId === bank)?.credit).toBe(3300);
      const proposed = ok(
        await previewStatements(raw("2026-09-02,クラウド利用料,0,4400,bank-2")),
      )[0];
      expect(proposed.suggestion).toMatchObject({
        accountId: cost,
        automatic: false,
      });
      expect(
        (
          await decideStatement({
            id: row.id,
            version: row.updatedAt.toISOString(),
            action: "approve",
            counterAccountId: cost,
          })
        ).ok,
      ).toBe(false);
    });
    it("automates only enabled exact rules and explicit import consent", async () => {
      const rule = await prisma.statementRule.findFirstOrThrow({
        where: { userId: auth.id },
      });
      ok(
        await updateStatementRule({
          id: rule.id,
          version: rule.updatedAt.toISOString(),
          active: true,
          automatic: true,
        }),
      );
      expect(
        ok(
          await importStatements(
            raw("2026-09-02,クラウド利用料,0,4400,bank-2"),
          ),
        ).posted,
      ).toBe(0);
      expect(
        ok(
          await importStatements(
            raw("2026-09-03,クラウド利用料,0,5500,bank-3", {
              allowAutomatic: true,
            }),
          ),
        ).posted,
      ).toBe(1);
      expect(
        ok(
          await previewStatements(
            raw("2026-09-04,クラウド利用料2,0,4400,different"),
          ),
        )[0].suggestion,
      ).toBe(null);
      expect(
        ok(
          await previewStatements(
            raw("2026-09-04,クラウド利用料,4400,0,refund"),
          ),
        )[0].suggestion,
      ).toBe(null);
    });
    it("undo preserves a reversal, prevents duplicate reimport and turns off automatic registration", async () => {
      const row = await getRow("bank-3");
      ok(
        await decideStatement({
          id: row.id,
          version: row.updatedAt.toISOString(),
          action: "undo",
        }),
      );
      expect(
        await prisma.journalEntry.count({
          where: { userId: auth.id, reversalOf: row.entryId },
        }),
      ).toBe(1);
      expect((await getRow("bank-3")).status).toBe("PENDING");
      expect(
        (
          await prisma.statementRule.findFirstOrThrow({
            where: { userId: auth.id },
          })
        ).automatic,
      ).toBe(false);
      expect(
        ok(
          await importStatements(
            raw("2026-09-03,クラウド利用料,0,5500,bank-3"),
          ),
        ).imported,
      ).toBe(0);
      const pending = await getRow("bank-3");
      ok(
        await decideStatement({
          id: pending.id,
          version: pending.updatedAt.toISOString(),
          action: "approve",
          counterAccountId: otherCost,
        }),
      );
      expect((await getRow("bank-3")).entryId).not.toBe(row.entryId);
    });
    it("rejects cross-owner feed, rule, row, account access and invalid dates without partial writes", async () => {
      const row = await getRow("bank-2"),
        rule = await prisma.statementRule.findFirstOrThrow({
          where: { userId: auth.id },
        });
      auth.id = "statements-test-b";
      expect((await previewStatements(raw("2026-09-01,店,0,100,bad"))).ok).toBe(
        false,
      );
      expect(
        (
          await decideStatement({
            id: row.id,
            version: row.updatedAt.toISOString(),
            action: "ignore",
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await updateStatementRule({
            id: rule.id,
            version: rule.updatedAt.toISOString(),
            active: true,
            automatic: true,
          })
        ).ok,
      ).toBe(false);
      expect(
        (
          await createStatementFeed({
            name: "不正",
            kind: "BANK",
            accountId: bank,
          })
        ).ok,
      ).toBe(false);
      const foreign = await prisma.account.findFirstOrThrow({
        where: { userId: auth.id, code: "530" },
      });
      auth.id = "statements-test-a";
      expect(
        (
          await decideStatement({
            id: row.id,
            version: row.updatedAt.toISOString(),
            action: "approve",
            counterAccountId: foreign.id,
          })
        ).ok,
      ).toBe(false);
      const before = await prisma.statementRow.count({
        where: { userId: auth.id },
      });
      expect(
        (
          await importStatements(
            raw("2026-09-01,店,0,100,new-valid\n2025-12-31,店,0,100,too-old"),
          )
        ).ok,
      ).toBe(false);
      expect(
        (await importStatements(raw("2099-01-01,店,0,100,future"))).ok,
      ).toBe(false);
      expect(
        (await importStatements(raw("2026-09-01,クラウド利用料,0,999,bank-1")))
          .ok,
      ).toBe(false);
      expect(
        await prisma.statementRow.count({ where: { userId: auth.id } }),
      ).toBe(before);
    });
    it("matches existing entries without posting twice, restores pending safely", async () => {
      const saved = await saveJournal({
        requestKey: crypto.randomUUID(),
        date: "2026-09-02",
        memo: "既存銀行仕訳",
        lines: [
          { accountId: bank, debit: 0, credit: 4400 },
          { accountId: cost, debit: 4400, credit: 0 },
        ],
      });
      expect(saved.ok).toBe(true);
      const entry = await prisma.journalEntry.findFirstOrThrow({
          where: { userId: auth.id, memo: "既存銀行仕訳" },
        }),
        row = await getRow("bank-2"),
        before = await prisma.journalEntry.count({
          where: { userId: auth.id },
        });
      ok(
        await decideStatement({
          id: row.id,
          version: row.updatedAt.toISOString(),
          action: "link",
          entryId: entry.id,
        }),
      );
      expect(
        await prisma.journalEntry.count({ where: { userId: auth.id } }),
      ).toBe(before);
      const linked = await getRow("bank-2");
      expect(linked.status).toBe("LINKED");
      ok(
        await decideStatement({
          id: linked.id,
          version: linked.updatedAt.toISOString(),
          action: "undo",
        }),
      );
      expect(
        await prisma.journalEntry.count({ where: { userId: auth.id } }),
      ).toBe(before);
    });
    it("suggests from manual history but refuses ambiguous or reversed history", async () => {
      const manual = async (accountId: string) =>
        saveJournal({
          requestKey: crypto.randomUUID(),
          date: "2026-09-01",
          memo: "手動履歴",
          lines: [
            { accountId: bank, debit: 0, credit: 100 },
            { accountId, debit: 100, credit: 0 },
          ],
        });
      await manual(cost);
      expect(
        ok(await previewStatements(raw("2026-09-04,手動履歴,0,200,hist")))[0]
          .suggestion,
      ).toMatchObject({ accountId: cost, automatic: false });
      await manual(otherCost);
      expect(
        ok(await previewStatements(raw("2026-09-04,手動履歴,0,200,hist")))[0]
          .suggestion,
      ).toBe(null);
    });
    it("records card spend as expense/payable, and handles exclusion/reimport", async () => {
      const cardFeed = ok(
        await createStatementFeed({
          name: "カード",
          kind: "CARD",
          accountId: card,
        }),
      );
      const v = raw("2026-09-01,カード備品,2200,card-1", {
        feedId: cardFeed,
        text: "日付,摘要,利用額,明細ID\n2026-09-01,カード備品,2200,card-1",
        mapping: { ...mapping, mode: "card", amount: 2, reference: 3 },
      });
      ok(await importStatements(v));
      let row = await getRow("card-1");
      ok(
        await decideStatement({
          id: row.id,
          version: row.updatedAt.toISOString(),
          action: "ignore",
        }),
      );
      expect(ok(await importStatements(v)).duplicates).toBe(1);
      row = await getRow("card-1");
      ok(
        await decideStatement({
          id: row.id,
          version: row.updatedAt.toISOString(),
          action: "undo",
        }),
      );
      row = await getRow("card-1");
      ok(
        await decideStatement({
          id: row.id,
          version: row.updatedAt.toISOString(),
          action: "approve",
          counterAccountId: otherCost,
        }),
      );
      row = await getRow("card-1");
      const journal = await prisma.journalEntry.findUniqueOrThrow({
        where: { id: row.entryId! },
        include: { lines: true },
      });
      expect(journal.lines.find((l) => l.accountId === card)?.credit).toBe(
        2200,
      );
      expect(journal.lines.find((l) => l.accountId === otherCost)?.debit).toBe(
        2200,
      );
    });
  },
);
