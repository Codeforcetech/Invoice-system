import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "wsp-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ sub: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error("redirect:" + to);
  },
}));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  cancelJournal,
  initializeAccounting,
  saveAccount,
  saveJournal,
} from "@/actions/accounting-actions";
import { addWorkspaceMember } from "@/actions/workspace-actions";
import { updateSettings } from "@/actions/settings-actions";
import { createCompany, listCompanies } from "@/actions/company-actions";

const owner = "wsp-test-owner",
  viewer = "wsp-test-viewer",
  editor = "wsp-test-editor",
  approver = "wsp-test-approver",
  admin = "wsp-test-admin",
  outsider = "wsp-test-outsider",
  users = [owner, viewer, editor, approver, admin, outsider];
const email = (id: string) => id + "@example.test";

async function cleanup() {
  await purgeAudit(users);
  await prisma.journalEntry.deleteMany({ where: { userId: { in: users } } });
  await prisma.workspaceMember.deleteMany({
    where: { OR: [{ ownerId: { in: users } }, { userId: { in: users } }] },
  });
  await prisma.appNotification.deleteMany({ where: { userId: { in: users } } });
  await prisma.company.deleteMany({ where: { userId: { in: users } } });
  await prisma.systemSetting.deleteMany({ where: { userId: { in: users } } });
  await prisma.account.deleteMany({ where: { userId: { in: users } } });
  await prisma.accountingSetting.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

let cash: string, sales: string;
const entry = (memo: string) => ({
  requestKey: crypto.randomUUID(),
  date: "2026-09-10",
  memo,
  lines: [
    { accountId: cash, debit: 5000, credit: 0 },
    { accountId: sales, debit: 0, credit: 5000 },
  ],
});
const settingsInput = {
  companyName: "権限テスト株式会社",
  taxRate: 1000,
};

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "role enforcement in real actions",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of users)
        await prisma.user.create({
          data: { id, name: id, email: email(id), passwordHash: "no-login" },
        });
      auth.id = owner;
      await initializeAccounting({ industry: "SERVICE", startDate: "2026-01-01" });
      cash = (await prisma.account.findFirstOrThrow({ where: { userId: owner, code: "100" } })).id;
      sales = (await prisma.account.findFirstOrThrow({ where: { userId: owner, kind: "REVENUE" } })).id;
      for (const [id, role] of [
        [viewer, "VIEWER"],
        [editor, "EDITOR"],
        [approver, "APPROVER"],
        [admin, "ADMIN"],
      ])
        expect(await addWorkspaceMember({ email: email(id), role })).toEqual({ ok: true });
    });
    afterAll(cleanup);

    it("a viewer cannot post a journal", async () => {
      auth.id = viewer;
      const r = await saveJournal(entry("閲覧者の仕訳"));
      expect(r).toMatchObject({ ok: false });
      expect((r as { error: string }).error).toMatch(/入力可/);
      expect(await prisma.journalEntry.count({ where: { memo: "閲覧者の仕訳" } })).toBe(0);
    });

    it("an editor's journal belongs to the workspace and the log names the editor", async () => {
      auth.id = editor;
      expect(await saveJournal(entry("入力者の仕訳"))).toMatchObject({ ok: true });
      const row = await prisma.journalEntry.findFirstOrThrow({ where: { memo: "入力者の仕訳" } });
      expect(row.userId).toBe(owner);
      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: "JOURNAL_POST", entityId: row.id },
      });
      expect(log.ownerId).toBe(owner);
      expect(log.actorId).toBe(editor);
    });

    it("an editor cannot cancel a journal, an approver can", async () => {
      const row = await prisma.journalEntry.findFirstOrThrow({ where: { memo: "入力者の仕訳" } });
      auth.id = editor;
      await expect(cancelJournal({ id: row.id, date: "2026-09-11", reason: "誤り" })).rejects.toThrow(/承認可/);
      auth.id = approver;
      await cancelJournal({ id: row.id, date: "2026-09-11", reason: "誤り" });
      const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "JOURNAL_CANCEL", entityId: row.id } });
      expect(log.actorId).toBe(approver);
      expect(log.summary).toContain("誤り");
    });

    it("only administrators change the chart of accounts and company settings", async () => {
      const acct = { code: "9100", name: "権限テスト科目", kind: "EXPENSE", active: true };
      for (const id of [viewer, editor, approver]) {
        auth.id = id;
        await expect(saveAccount(acct)).rejects.toThrow(/管理者/);
        await expect(updateSettings(settingsInput)).rejects.toThrow(/管理者/);
      }
      auth.id = admin;
      await saveAccount(acct);
      await updateSettings(settingsInput);
      expect(await prisma.account.count({ where: { userId: owner, code: "9100" } })).toBe(1);
      expect(await prisma.systemSetting.count({ where: { userId: owner } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { ownerId: owner, actorId: admin } })).toBe(2);
    });

    it("shares companies across the workspace but not with outsiders", async () => {
      auth.id = editor;
      await createCompany({ name: "共有取引先", invoiceCode: "SHR" });
      expect((await prisma.company.findFirstOrThrow({ where: { name: "共有取引先" } })).userId).toBe(owner);
      auth.id = viewer;
      expect((await listCompanies()).map((c: { name: string }) => c.name)).toContain("共有取引先");
      auth.id = outsider;
      expect((await listCompanies()).map((c: { name: string }) => c.name)).not.toContain("共有取引先");
      await expect(saveJournal(entry("部外者"))).resolves.toMatchObject({ ok: false });
      expect(await prisma.journalEntry.count({ where: { memo: "部外者" } })).toBe(0);
    });

    it("a suspended editor can no longer post into the workspace", async () => {
      await prisma.workspaceMember.update({ where: { userId: editor }, data: { active: false } });
      auth.id = editor;
      const r = await saveJournal(entry("停止後の仕訳"));
      expect(r).toMatchObject({ ok: false });
      expect(await prisma.journalEntry.count({ where: { memo: "停止後の仕訳" } })).toBe(0);
    });
  },
);
