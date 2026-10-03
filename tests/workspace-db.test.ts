import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "ws-test-owner" }));
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
import {
  addWorkspaceMember,
  setMemberActive,
  setMemberRole,
} from "@/actions/workspace-actions";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { recordAudit } from "@/lib/workspace/audit";
import { purgeAudit } from "./audit-cleanup";

const owner = "ws-test-owner",
  editor = "ws-test-editor",
  viewer = "ws-test-viewer",
  busy = "ws-test-busy",
  other = "ws-test-other-owner",
  users = [owner, editor, viewer, busy, other];

async function cleanup() {
  await purgeAudit(users);
  await prisma.workspaceMember.deleteMany({
    where: { OR: [{ ownerId: { in: users } }, { userId: { in: users } }] },
  });
  await prisma.appNotification.deleteMany({ where: { userId: { in: users } } });
  await prisma.company.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}
const email = (id: string) => id + "@example.test";

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")("workspace members and audit log", () => {
  beforeAll(async () => {
    await cleanup();
    for (const id of users)
      await prisma.user.create({
        data: { id, name: id, email: email(id), passwordHash: "no-login" },
      });
    // `busy` already has its own data, so it must not be absorbed into another workspace.
    await prisma.company.create({
      data: { userId: busy, name: "既存取引先", invoiceCode: "BUSY" },
    });
  });
  afterAll(cleanup);

  it("lets the owner add members and records who did it", async () => {
    auth.id = owner;
    expect(await addWorkspaceMember({ email: email(editor), role: "EDITOR" })).toEqual({ ok: true });
    expect(await addWorkspaceMember({ email: email(viewer).toUpperCase(), role: "VIEWER" })).toEqual({ ok: true });
    const logs = await prisma.auditLog.findMany({ where: { ownerId: owner }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["MEMBER_ADD", "MEMBER_ADD"]);
    expect(logs.every((l) => l.actorId === owner)).toBe(true);
    // The added user is told.
    expect(await prisma.appNotification.count({ where: { userId: editor } })).toBe(1);
  });

  it("resolves the member into the owner's workspace with their role", async () => {
    auth.id = editor;
    const ws = await requireWorkspace("EDITOR");
    expect(ws.ownerId).toBe(owner);
    expect(ws.userId).toBe(editor);
    expect(ws.role).toBe("EDITOR");
    await expect(requireWorkspace("APPROVER")).rejects.toThrow(/承認可/);
    auth.id = viewer;
    await expect(requireWorkspace("EDITOR")).rejects.toThrow(/入力可/);
  });

  it("only an administrator can manage members", async () => {
    auth.id = editor;
    const r = await addWorkspaceMember({ email: email(other), role: "VIEWER" });
    expect(r.ok).toBe(false);
    const r2 = await setMemberRole({ memberId: "x", role: "ADMIN" });
    expect(r2.ok).toBe(false);
    expect(await prisma.workspaceMember.count({ where: { userId: other } })).toBe(0);
  });

  it("refuses accounts that already hold their own data, other workspaces' members, and the owner", async () => {
    auth.id = owner;
    expect((await addWorkspaceMember({ email: email(busy), role: "VIEWER" })).ok).toBe(false);
    expect((await addWorkspaceMember({ email: email(owner), role: "VIEWER" })).ok).toBe(false);
    expect((await addWorkspaceMember({ email: "nobody@example.test", role: "VIEWER" })).ok).toBe(false);
    expect((await addWorkspaceMember({ email: email(editor), role: "ADMIN" })).ok).toBe(false);
    auth.id = other;
    const r = await addWorkspaceMember({ email: email(editor), role: "VIEWER" });
    expect(r.ok).toBe(false);
  });

  it("rejects an invalid role", async () => {
    auth.id = owner;
    const r = await addWorkspaceMember({ email: email(other), role: "OWNER" });
    expect(r.ok).toBe(false);
  });

  it("changes a role and takes effect immediately", async () => {
    auth.id = owner;
    const m = await prisma.workspaceMember.findUniqueOrThrow({ where: { userId: viewer } });
    expect(await setMemberRole({ memberId: m.id, role: "APPROVER" })).toEqual({ ok: true });
    auth.id = viewer;
    expect((await requireWorkspace("APPROVER")).role).toBe("APPROVER");
    expect(await prisma.auditLog.count({ where: { ownerId: owner, action: "MEMBER_ROLE" } })).toBe(1);
  });

  it("cannot change a member of another workspace", async () => {
    auth.id = other;
    const m = await prisma.workspaceMember.findUniqueOrThrow({ where: { userId: viewer } });
    expect((await setMemberRole({ memberId: m.id, role: "VIEWER" })).ok).toBe(false);
    expect((await setMemberActive({ memberId: m.id, active: false })).ok).toBe(false);
    expect((await prisma.workspaceMember.findUniqueOrThrow({ where: { userId: viewer } })).role).toBe("APPROVER");
  });

  it("a suspended member loses access and does not get an administrator workspace of the old one", async () => {
    auth.id = owner;
    const m = await prisma.workspaceMember.findUniqueOrThrow({ where: { userId: editor } });
    expect(await setMemberActive({ memberId: m.id, active: false })).toEqual({ ok: true });
    auth.id = editor;
    const ws = await requireWorkspace("VIEWER");
    expect(ws.ownerId).toBe(editor);
    auth.id = owner;
    expect(await setMemberActive({ memberId: m.id, active: true })).toEqual({ ok: true });
    auth.id = editor;
    expect((await requireWorkspace("VIEWER")).ownerId).toBe(owner);
  });

  it("makes audit rows append-only in the database", async () => {
    const row = await prisma.auditLog.findFirstOrThrow({ where: { ownerId: owner } });
    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { summary: "改ざん" } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });

  it("does not leave a log row when the surrounding change rolls back", async () => {
    const before = await prisma.auditLog.count({ where: { ownerId: owner } });
    await expect(
      prisma.$transaction(async (tx) => {
        await recordAudit(tx, { ownerId: owner, userId: owner }, { action: "TEST", entity: "SETTING", summary: "x" });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await prisma.auditLog.count({ where: { ownerId: owner } })).toBe(before);
  });

  it("enforces role values and self-membership in the database", async () => {
    await expect(
      prisma.workspaceMember.create({ data: { ownerId: owner, userId: other, role: "SUPER" } }),
    ).rejects.toThrow();
    await expect(
      prisma.workspaceMember.create({ data: { ownerId: owner, userId: owner, role: "ADMIN" } }),
    ).rejects.toThrow();
  });
});
