import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "aud-test-owner", role: "ADMIN" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id, role: auth.role }),
}));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  getSession: async () => ({ sub: auth.id }),
  clearSession: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error("redirect:" + to);
  },
}));
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { purgeAudit } from "./audit-cleanup";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import {
  createItemTemplate,
  updateItemTemplate,
  deleteItemTemplate,
} from "@/actions/item-template-actions";
import {
  createMailTemplate,
  deleteMailTemplate,
} from "@/actions/mail-template-actions";
import { recordInvoiceMailDraft } from "@/actions/invoice-mail-actions";
import { adminCreateUser } from "@/actions/admin-user-actions";

const owner = "aud-test-owner",
  member = "aud-test-member",
  outsider = "aud-test-outsider",
  created = "aud-test-created@example.test",
  users = [owner, member, outsider];

async function cleanup() {
  await purgeAudit([...users]);
  const extra = await prisma.user.findMany({ where: { email: created }, select: { id: true } });
  await purgeAudit(extra.map((u) => u.id));
  await prisma.invoice.deleteMany({ where: { createdById: { in: users } } });
  await prisma.invoiceItemTemplate.deleteMany({ where: { userId: { in: users } } });
  await prisma.mailTemplate.deleteMany({ where: { userId: { in: users } } });
  await prisma.workspaceMember.deleteMany({ where: { OR: [{ ownerId: { in: users } }, { userId: { in: users } }] } });
  await prisma.company.deleteMany({ where: { userId: { in: users } } });
  await prisma.systemSetting.deleteMany({ where: { user: { email: created } } });
  await prisma.user.deleteMany({ where: { OR: [{ id: { in: users } }, { email: created }] } });
}
const form = (email: string, password: string) => {
  const f = new FormData();
  f.set("email", email);
  f.set("password", password);
  return new Request("http://127.0.0.1/api/auth/login", { method: "POST", body: f });
};
const logs = (where: object = {}) =>
  prisma.auditLog.findMany({ where: { ownerId: owner, ...where }, orderBy: { createdAt: "asc" } });

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")("operation log coverage", () => {
  beforeAll(async () => {
    await cleanup();
    const passwordHash = await hashPassword("Correct-Horse-2026!");
    for (const id of users)
      await prisma.user.create({
        data: { id, name: id, email: id + "@example.test", passwordHash, role: id === owner ? "ADMIN" : "USER" },
      });
    await prisma.workspaceMember.create({ data: { ownerId: owner, userId: member, role: "EDITOR" } });
  });
  afterAll(cleanup);

  it("logs sign-in and sign-out in the workspace of the person who signed in", async () => {
    await login(form(member + "@example.test", "Correct-Horse-2026!"));
    auth.id = member;
    await logout(new Request("http://127.0.0.1/api/auth/logout", { method: "POST" }));
    const rows = await logs({ entity: "SESSION" });
    expect(rows.map((r) => r.action)).toEqual(["LOGIN", "LOGOUT"]);
    expect(rows.every((r) => r.actorId === member)).toBe(true);
  });

  it("logs a failed sign-in for a real account, without storing what was typed", async () => {
    const res = await login(form(member + "@example.test", "wrong-password-typed"));
    expect(res.headers.get("Location")).toContain("error=invalid");
    const row = (await logs({ action: "LOGIN_FAILED" }))[0];
    expect(row.actorId).toBe(member);
    expect(JSON.stringify(row)).not.toContain("wrong-password-typed");
  });

  it("writes nothing for an unknown address and still refuses", async () => {
    // Count only this test's own users: other test files write audit rows in parallel.
    const count = () => prisma.auditLog.count({ where: { OR: [{ ownerId: { in: users } }, { actorId: { in: users } }] } });
    const before = await count();
    const res = await login(form("nobody-here@example.test", "x"));
    expect(res.headers.get("Location")).toContain("error=invalid");
    expect(await count()).toBe(before);
  });

  it("does not log a sign-in that was refused for a wrong password as a success", async () => {
    expect((await logs({ action: "LOGIN" })).length).toBe(1);
  });

  it("logs template changes by the editor into the owner's workspace", async () => {
    auth.id = member;
    auth.role = "USER";
    const item = await createItemTemplate({ name: "保守", productName: "保守", unit: "月", quantity: 1, unitPrice: 1000, note: "" });
    await updateItemTemplate({ id: item.id, data: { name: "保守（更新）", productName: "保守", unit: "月", quantity: 1, unitPrice: 2000, note: "" } });
    await deleteItemTemplate({ id: item.id });
    const mail = await createMailTemplate({ name: "送付", subjectTemplate: "件名", bodyTemplate: "本文" });
    await deleteMailTemplate({ id: mail.id });
    const actions = (await logs({ entity: "TEMPLATE" })).map((r) => r.action);
    expect(actions).toEqual([
      "ITEM_TEMPLATE_CREATE",
      "ITEM_TEMPLATE_UPDATE",
      "ITEM_TEMPLATE_DELETE",
      "MAIL_TEMPLATE_CREATE",
      "MAIL_TEMPLATE_DELETE",
    ]);
    expect((await logs({ entity: "TEMPLATE" })).every((r) => r.actorId === member)).toBe(true);
  });

  it("records a reported Gmail draft only for an invoice of the workspace", async () => {
    const company = await prisma.company.create({ data: { userId: owner, name: "取引先", invoiceCode: "AUD" } });
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: "AUD-TEST-001",
        companyId: company.id,
        subject: "件名",
        issueDate: new Date("2026-09-01"),
        dueDate: new Date("2026-09-30"),
        subtotal: 1000,
        taxRate: 1000,
        taxAmount: 100,
        totalWithTax: 1100,
        withholdingTax: 0,
        grandTotal: 1100,
        createdById: owner,
      },
    });
    auth.id = member;
    await recordInvoiceMailDraft({ invoiceId: invoice.id, outcome: "CREATED" });
    const row = (await logs({ entity: "MAIL" }))[0];
    expect(row.action).toBe("MAIL_DRAFT");
    expect(row.summary).toContain("ブラウザからの報告");
    auth.id = outsider;
    await expect(recordInvoiceMailDraft({ invoiceId: invoice.id, outcome: "CREATED" })).rejects.toThrow();
    expect((await logs({ entity: "MAIL" })).length).toBe(1);
  });

  it("logs user creation by a global administrator together with the user row", async () => {
    auth.id = owner;
    auth.role = "ADMIN";
    await adminCreateUser({ name: "新規ユーザー", email: created, password: "Another-Pass-2026!", role: "USER" });
    const row = (await logs({ entity: "USER" }))[0];
    expect(row.action).toBe("USER_CREATE");
    expect(row.actorId).toBe(owner);
    expect(JSON.stringify(row)).not.toContain("Another-Pass-2026!");
    expect(await prisma.user.count({ where: { email: created } })).toBe(1);
  });
});
