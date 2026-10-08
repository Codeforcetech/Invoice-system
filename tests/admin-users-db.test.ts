import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "au-owner", role: "ADMIN" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id, role: auth.role }),
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
  adminCreateUser,
  changeUserRole,
  listWorkspaceUsers,
  setUserActive,
} from "@/actions/admin-user-actions";
import { resolveWorkspace } from "@/lib/workspace/access";
import { adminCreateUserSchema } from "@/lib/validators/user";
import { purgeAudit } from "./audit-cleanup";

const owner = "au-owner",
  other = "au-other-owner",
  otherMember = "au-other-member",
  legacy = "au-legacy-viewer",
  fixed = [owner, other, otherMember, legacy];
const emails = [
  "au-new-submitter@example.test",
  "au-new-approver@example.test",
  "au-new-admin@example.test",
];
const pw = "Strong-Pass-2026!";

async function cleanup() {
  const created = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const users = [...fixed, ...created.map((u) => u.id)];
  await purgeAudit(users);
  await prisma.claimMember.deleteMany({
    where: { OR: [{ ownerId: { in: users } }, { userId: { in: users } }] },
  });
  await prisma.claimWorkspace.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.appNotification.deleteMany({ where: { userId: { in: users } } });
  await prisma.workspaceMember.deleteMany({
    where: { OR: [{ ownerId: { in: users } }, { userId: { in: users } }] },
  });
  await prisma.systemSetting.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe("new-user form", () => {
  it("defaults to the weakest access (applicant) and accepts only the three roles", () => {
    const base = { name: "a", email: "a@example.test", password: pw };
    expect(adminCreateUserSchema.parse(base).accessRole).toBe("SUBMITTER");
    expect(
      adminCreateUserSchema.safeParse({ ...base, accessRole: "VIEWER" })
        .success,
    ).toBe(false);
    expect(
      adminCreateUserSchema.safeParse({ ...base, accessRole: "APPROVER" })
        .success,
    ).toBe(true);
  });
});

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "user management with three roles",
  () => {
    const idOf = async (email: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
    beforeAll(async () => {
      await cleanup();
      for (const id of fixed)
        await prisma.user.create({
          data: {
            id,
            name: id,
            email: id + "@example.test",
            passwordHash: "x",
            role: id === owner || id === other ? "ADMIN" : "USER",
          },
        });
      await prisma.workspaceMember.create({
        data: { ownerId: other, userId: otherMember, role: "SUBMITTER" },
      });
      await prisma.workspaceMember.create({
        data: { ownerId: owner, userId: legacy, role: "VIEWER" },
      });
      await prisma.claimWorkspace.create({
        data: { ownerId: owner, name: "精算先" },
      });
    });
    afterAll(cleanup);

    it("creates users with the chosen role as members of the admin's workspace", async () => {
      auth.id = owner;
      auth.role = "ADMIN";
      await adminCreateUser({
        name: "申請 太郎",
        email: emails[0],
        password: pw,
        accessRole: "SUBMITTER",
      });
      await adminCreateUser({
        name: "承認 花子",
        email: emails[1],
        password: pw,
        accessRole: "APPROVER",
      });
      await adminCreateUser({
        name: "管理 次郎",
        email: emails[2],
        password: pw,
        accessRole: "ADMIN",
      });
      const [sub, app, adm] = await Promise.all(emails.map(idOf));
      expect((await resolveWorkspace(prisma, sub)).role).toBe("SUBMITTER");
      expect((await resolveWorkspace(prisma, app)).role).toBe("APPROVER");
      expect(await resolveWorkspace(prisma, adm)).toMatchObject({
        role: "ADMIN",
        ownerId: owner,
        isOwner: false,
      });
      // ユーザー管理の画面を開ける「全体管理者」は、管理者だけ
      const globals = await prisma.user.findMany({
        where: { id: { in: [sub, app, adm] } },
        select: { id: true, role: true },
      });
      expect(Object.fromEntries(globals.map((u) => [u.id, u.role]))).toEqual({
        [sub]: "USER",
        [app]: "USER",
        [adm]: "ADMIN",
      });
      // 経費精算の精算先があるので、申請・承認のメンバーにも入る
      const claim = await prisma.claimMember.findMany({
        where: { ownerId: owner, userId: { in: [sub, app, adm] } },
      });
      expect(Object.fromEntries(claim.map((c) => [c.userId, c.role]))).toEqual({
        [sub]: "SUBMITTER",
        [app]: "APPROVER",
        [adm]: "APPROVER",
      });
      const audit = await prisma.auditLog.findMany({
        where: { ownerId: owner, action: "USER_CREATE" },
      });
      expect(audit).toHaveLength(3);
      expect(JSON.stringify(audit)).not.toContain(pw);
    });

    it("refuses a duplicate e-mail address with a clear message", async () => {
      await expect(
        adminCreateUser({
          name: "重複",
          email: emails[0],
          password: pw,
          accessRole: "SUBMITTER",
        }),
      ).rejects.toThrow("すでに登録されています");
    });

    it("lists everyone in the system, this workspace first, and marks the others as read-only", async () => {
      const all = await listWorkspaceUsers();
      expect(all[0]).toMatchObject({
        userId: owner,
        role: "OWNER",
        isSelf: true,
        scope: "this",
      });
      const byId = new Map(all.map((r) => [r.userId, r]));
      expect(byId.get(legacy)).toMatchObject({ scope: "this", role: "VIEWER" });
      // ほかの事業所の人も出る（見るだけ）
      expect(byId.get(otherMember)).toMatchObject({
        scope: "other",
        otherRole: "申請者（別の事業所）",
      });
      expect(byId.get(other)).toMatchObject({
        scope: "other",
        otherRole: "管理者（自分の事業所）",
      });
      // この事業所の人が、ほかの事業所の人より先に並ぶ
      const firstOther = all.findIndex((r) => r.scope === "other");
      expect(all.slice(firstOther).every((r) => r.scope === "other")).toBe(
        true,
      );
      expect(
        (await listWorkspaceUsers({ q: "au-new-approver" })).map((r) => r.name),
      ).toEqual(["承認 花子"]);
    });

    it("changes a role at any time, keeping the user's rights in step", async () => {
      const sub = await idOf(emails[0]);
      expect(
        await changeUserRole({ userId: sub, accessRole: "ADMIN" }),
      ).toEqual({ ok: true });
      expect((await resolveWorkspace(prisma, sub)).role).toBe("ADMIN");
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: sub } })).role,
      ).toBe("ADMIN");
      expect(
        (
          await prisma.claimMember.findUniqueOrThrow({
            where: { ownerId_userId: { ownerId: owner, userId: sub } },
          })
        ).role,
      ).toBe("APPROVER");
      expect(
        await changeUserRole({ userId: sub, accessRole: "SUBMITTER" }),
      ).toEqual({ ok: true });
      expect((await resolveWorkspace(prisma, sub)).role).toBe("SUBMITTER");
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: sub } })).role,
      ).toBe("USER");
      expect(
        (
          await prisma.claimMember.findUniqueOrThrow({
            where: { ownerId_userId: { ownerId: owner, userId: sub } },
          })
        ).role,
      ).toBe("SUBMITTER");
      expect(
        await prisma.auditLog.count({
          where: { ownerId: owner, action: "MEMBER_ROLE" },
        }),
      ).toBe(2);
      // 従来の権限（閲覧のみ）の人も、3つのどれかに変えられる
      expect(
        await changeUserRole({ userId: legacy, accessRole: "SUBMITTER" }),
      ).toEqual({ ok: true });
    });

    it("does not let an admin change their own role, the owner, or another workspace's people", async () => {
      const adm = await idOf(emails[2]);
      auth.id = adm;
      auth.role = "ADMIN";
      expect(
        await changeUserRole({ userId: adm, accessRole: "SUBMITTER" }),
      ).toMatchObject({ ok: false });
      expect(
        await changeUserRole({ userId: owner, accessRole: "SUBMITTER" }),
      ).toMatchObject({ ok: false });
      expect(
        await changeUserRole({ userId: otherMember, accessRole: "ADMIN" }),
      ).toMatchObject({ ok: false });
      expect(
        (
          await prisma.workspaceMember.findUniqueOrThrow({
            where: { userId: otherMember },
          })
        ).role,
      ).toBe("SUBMITTER");
      // 管理者に変えてもらった管理者は、同じ事業所のほかの人を変えられる
      expect(
        await changeUserRole({
          userId: await idOf(emails[1]),
          accessRole: "SUBMITTER",
        }),
      ).toEqual({ ok: true });
    });

    it("only administrators can create users or change roles", async () => {
      const app = await idOf(emails[1]);
      // 全体管理者でない人は、画面に入れない
      auth.id = app;
      auth.role = "USER";
      await expect(
        adminCreateUser({
          name: "x",
          email: "x@example.test",
          password: pw,
          accessRole: "ADMIN",
        }),
      ).rejects.toThrow("redirect:");
      await expect(
        changeUserRole({ userId: owner, accessRole: "SUBMITTER" }),
      ).resolves.toMatchObject({ ok: false });
      // 全体管理者でも、事業所の権限が管理者でなければ、できない（承認者に下げられた人）
      auth.role = "ADMIN";
      await expect(
        adminCreateUser({
          name: "x",
          email: "x@example.test",
          password: pw,
          accessRole: "ADMIN",
        }),
      ).rejects.toThrow();
      expect(
        await prisma.user.count({ where: { email: "x@example.test" } }),
      ).toBe(0);
    });

    it("suspends and resumes a user", async () => {
      auth.id = owner;
      auth.role = "ADMIN";
      const sub = await idOf(emails[0]);
      expect(await setUserActive({ userId: sub, active: false })).toEqual({
        ok: true,
      });
      expect((await resolveWorkspace(prisma, sub)).isOwner).toBe(true); // 事業所のデータは見えない
      expect(await setUserActive({ userId: sub, active: true })).toEqual({
        ok: true,
      });
      expect((await resolveWorkspace(prisma, sub)).ownerId).toBe(owner);
      expect(
        await setUserActive({ userId: owner, active: false }),
      ).toMatchObject({ ok: false });
    });
  },
);
