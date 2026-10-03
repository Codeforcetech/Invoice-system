import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "easy-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ sub: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import { initializeAccounting } from "@/actions/accounting-actions";
import {
  recordEasyTransaction,
  saveOpeningBalances,
} from "@/actions/easy-accounting-actions";

const owner = "easy-test-owner",
  editor = "easy-test-editor",
  viewer = "easy-test-viewer",
  fresh = "easy-test-fresh",
  users = [owner, editor, viewer, fresh];

const as = (id: string) => {
  auth.id = id;
};
const pdf = (text: string) =>
  new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${text}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
const idOf = async (code: string, who = owner) =>
  (
    await prisma.account.findUniqueOrThrow({
      where: { userId_code: { userId: who, code } },
    })
  ).id;
const form = (over: Record<string, string | File> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    requestKey: crypto.randomUUID(),
    kind: "OUT",
    date: "2026-09-10",
    amount: "5500",
    categoryAccountId: "",
    moneyAccountId: "",
    toAccountId: "",
    memo: "NTT 電話代",
    taxChoice: "10",
    ...over,
  }))
    fd.set(k, v);
  return fd;
};
const lines = (entryId: string) =>
  prisma.journalLine.findMany({
    where: { entryId },
    include: { account: true },
    orderBy: [{ debit: "desc" }],
  });

async function cleanup() {
  await purgeAudit(users);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.evidenceHistory.deleteMany({ where: { ownerId: { in: users } } });
    await tx.evidenceFile.deleteMany({ where: { ownerId: { in: users } } });
  });
  await prisma.journalEntry.deleteMany({ where: { userId: { in: users } } });
  await prisma.workspaceMember.deleteMany({
    where: { ownerId: { in: users } },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "easy transaction entry",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of users)
        await prisma.user.create({
          data: {
            id,
            name: id,
            email: id + "@example.test",
            passwordHash: "no-login",
          },
        });
      for (const [userId, role] of [
        [editor, "EDITOR"],
        [viewer, "VIEWER"],
      ])
        await prisma.workspaceMember.create({
          data: { ownerId: owner, userId, role },
        });
      as(owner);
      await initializeAccounting({
        startDate: "2026-04-01",
        industry: "SERVICE",
      });
    });
    afterAll(cleanup);

    it("records money going out as a balanced entry with the tax category", async () => {
      as(editor);
      const r = await recordEasyTransaction(
        form({
          categoryAccountId: await idOf("530"),
          moneyAccountId: await idOf("110"),
        }),
      );
      expect(r).toMatchObject({ ok: true });
      const rows = await lines((r as { id: string }).id);
      expect(
        rows.map((l) => [l.account.name, l.debit, l.credit, l.taxCategory]),
      ).toEqual([
        ["通信費", 5500, 0, "TAXABLE_10"],
        ["普通預金", 0, 5500, null],
      ]);
      const entry = await prisma.journalEntry.findUniqueOrThrow({
        where: { id: (r as { id: string }).id },
      });
      expect(entry).toMatchObject({
        memo: "NTT 電話代",
        source: "MANUAL",
        userId: owner,
      });
      expect(
        await prisma.auditLog.count({
          where: { ownerId: owner, action: "JOURNAL_POST", actorId: editor },
        }),
      ).toBeGreaterThan(0);
    });

    it("records money coming in, and creates 'other income' only when first used", async () => {
      expect(
        await prisma.account.count({ where: { userId: owner, code: "410" } }),
      ).toBe(0);
      const r = await recordEasyTransaction(
        form({
          kind: "IN",
          categoryAccountId: "new:410",
          moneyAccountId: await idOf("110"),
          memo: "預金利息",
          taxChoice: "none",
          amount: "300",
        }),
      );
      expect(r).toMatchObject({ ok: true });
      expect(
        (await lines((r as { id: string }).id)).map((l) => [
          l.account.name,
          l.debit,
          l.credit,
        ]),
      ).toEqual([
        ["普通預金", 300, 0],
        ["雑収入", 0, 300],
      ]);
      // Reused, not duplicated, the second time.
      await recordEasyTransaction(
        form({
          kind: "IN",
          categoryAccountId: "new:410",
          moneyAccountId: await idOf("110"),
          memo: "返金",
          taxChoice: "none",
        }),
      );
      expect(
        await prisma.account.count({ where: { userId: owner, code: "410" } }),
      ).toBe(1);
    });

    it("records a transfer between cash and bank without a description", async () => {
      const r = await recordEasyTransaction(
        form({
          kind: "MOVE",
          memo: "",
          moneyAccountId: await idOf("110"),
          toAccountId: await idOf("100"),
          amount: "30000",
        }),
      );
      expect(r).toMatchObject({ ok: true });
      const rows = await lines((r as { id: string }).id);
      expect(rows.map((l) => [l.account.name, l.debit, l.credit])).toEqual([
        ["現金", 30000, 0],
        ["普通預金", 0, 30000],
      ]);
    });

    it("does not record the same submission twice", async () => {
      const key = crypto.randomUUID();
      const f = async () =>
        form({
          requestKey: key,
          categoryAccountId: await idOf("560"),
          moneyAccountId: await idOf("100"),
          memo: "二重送信テスト",
        });
      const a = await recordEasyTransaction(await f());
      const b = await recordEasyTransaction(await f());
      expect(a).toMatchObject({ ok: true });
      expect((b as { id: string }).id).toBe((a as { id: string }).id);
      expect(
        await prisma.journalEntry.count({
          where: { userId: owner, memo: "二重送信テスト" },
        }),
      ).toBe(1);
    });

    it("saves an attached receipt to the evidence box with the entry", async () => {
      const bytes = pdf("receipt");
      const r = await recordEasyTransaction(
        form({
          categoryAccountId: await idOf("560"),
          moneyAccountId: await idOf("100"),
          memo: "文具店",
          amount: "1200",
          file: new File([bytes as Uint8Array<ArrayBuffer>], "領収書.pdf", {
            type: "application/pdf",
          }),
        }),
      );
      expect(r).toMatchObject({ ok: true });
      const ev = await prisma.evidenceFile.findFirstOrThrow({
        where: { ownerId: owner, counterparty: "文具店" },
      });
      expect(ev).toMatchObject({
        kind: "RECEIPT",
        amount: 1200,
        filename: "領収書.pdf",
        uploadedById: auth.id,
      });
      expect(
        await prisma.evidenceHistory.count({
          where: { evidenceId: ev.id, action: "UPLOAD" },
        }),
      ).toBe(1);
    });

    it("treats the empty file a browser sends when none was chosen as 'no attachment'", async () => {
      const r = await recordEasyTransaction(
        form({
          categoryAccountId: await idOf("560"),
          moneyAccountId: await idOf("100"),
          memo: "添付なし",
          file: new File([], ""),
        }),
      );
      expect(r).toMatchObject({ ok: true });
      expect(
        await prisma.evidenceFile.count({
          where: { ownerId: owner, counterparty: "添付なし" },
        }),
      ).toBe(0);
    });

    it("refuses a bad attachment before anything is recorded", async () => {
      const before = await prisma.journalEntry.count({
        where: { userId: owner },
      });
      const r = await recordEasyTransaction(
        form({
          categoryAccountId: await idOf("560"),
          moneyAccountId: await idOf("100"),
          memo: "壊れたファイル",
          file: new File([new Uint8Array([1, 2, 3, 4])], "x.pdf", {
            type: "application/pdf",
          }),
        }),
      );
      expect(r.ok).toBe(false);
      expect(
        await prisma.journalEntry.count({ where: { userId: owner } }),
      ).toBe(before);
    });

    it("rejects accounts that are not offered (e.g. a liability as the cost, or someone else's id)", async () => {
      const bad = await recordEasyTransaction(
        form({
          categoryAccountId: await idOf("200"),
          moneyAccountId: await idOf("110"),
        }),
      );
      expect(bad).toMatchObject({ ok: false });
      const notMoney = await recordEasyTransaction(
        form({
          categoryAccountId: await idOf("530"),
          moneyAccountId: await idOf("400"),
        }),
      );
      expect(notMoney).toMatchObject({ ok: false });
      expect(
        await recordEasyTransaction(
          form({
            categoryAccountId: "new:410",
            moneyAccountId: await idOf("110"),
          }),
        ),
      ).toMatchObject({
        ok: false,
      });
    });

    it("lets viewers look but not record", async () => {
      as(viewer);
      const r = await recordEasyTransaction(
        form({
          categoryAccountId: await idOf("530"),
          moneyAccountId: await idOf("110"),
        }),
      );
      expect(r.ok).toBe(false);
      as(owner);
    });

    it("explains missing input in plain words instead of failing silently", async () => {
      const r = await recordEasyTransaction(
        form({ categoryAccountId: "", moneyAccountId: await idOf("110") }),
      );
      expect(r).toEqual({
        ok: false,
        error: expect.stringMatching(/何のお金/),
      });
    });

    it("opening balances: asks plain questions, balances itself, and works once", async () => {
      as(owner);
      const r = await saveOpeningBalances({
        cash: 100000,
        bank: 2000000,
        receivable: 300000,
        payable: 50000,
        loan: 1000000,
      });
      expect(r).toEqual({ ok: true, equity: 1350000 });
      const entry = await prisma.journalEntry.findFirstOrThrow({
        where: { userId: owner, memo: "開始残高" },
      });
      expect(entry.date.toISOString().slice(0, 10)).toBe("2026-04-01");
      const rows = await lines(entry.id);
      expect(rows.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
      expect(rows.find((l) => l.account.code === "300")?.credit).toBe(1350000);
      expect(
        await saveOpeningBalances({
          cash: 1,
          bank: 0,
          receivable: 0,
          payable: 0,
          loan: 0,
        }),
      ).toMatchObject({ ok: false });
    });

    it("opening balances need an admin and a started accounting setup", async () => {
      as(editor);
      expect(
        await saveOpeningBalances({
          cash: 1,
          bank: 0,
          receivable: 0,
          payable: 0,
          loan: 0,
        }),
      ).toMatchObject({ ok: false });
      as(fresh);
      expect(
        await saveOpeningBalances({
          cash: 1,
          bank: 0,
          receivable: 0,
          payable: 0,
          loan: 0,
        }),
      ).toEqual({
        ok: false,
        error: expect.stringMatching(/会計をはじめる/),
      });
      expect(
        await recordEasyTransaction(
          form({ categoryAccountId: "x", moneyAccountId: "y" }),
        ),
      ).toMatchObject({ ok: false });
      as(owner);
    });
  },
);
