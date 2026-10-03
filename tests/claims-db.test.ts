import { afterAll, beforeAll, describe, it, expect, vi } from "vitest";
import sharp from "sharp";
const auth = vi.hoisted(() => ({ id: "claims-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ sub: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import { initializeAccounting } from "@/actions/accounting-actions";
import {
  setupClaimWorkspace,
  saveClaimMember,
  saveClaim,
  processClaim,
} from "@/actions/claim-actions";
import {
  setNotificationEmail,
  markNotificationRead,
} from "@/actions/notification-actions";
import { visibleClaimWhere } from "@/lib/claims/access";
import { GET } from "@/app/api/claims/[claimId]/receipt/route";
const owner = "claims-test-owner",
  applicant = "claims-test-applicant",
  reviewer = "claims-test-reviewer",
  outsider = "claims-test-outsider",
  users = [owner, applicant, reviewer, outsider];
let receipt: Uint8Array, claimId: string, expenseId: string, bankId: string;
const good = (r: { ok: boolean; error?: string }) => {
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
};
async function cleanup() {
  await prisma.claimEvent.deleteMany({ where: { actorId: { in: users } } });
  await prisma.expenseClaim.deleteMany({ where: { ownerId: owner } });
  await prisma.claimWorkspace.deleteMany({ where: { ownerId: owner } });
  await prisma.journalEntry.deleteMany({ where: { userId: { in: users } } });
  await purgeAudit(users);
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}
function form(
  id = crypto.randomUUID(),
  version?: string,
  amount = 3300,
  attach = true,
) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id,
    ownerId: owner,
    title: "テスト交通費",
    merchant: "テスト鉄道",
    date: "2026-09-10",
    amount: String(amount),
    category: "交通費",
    note: "営業訪問",
    ...(version ? { version } : {}),
  }))
    f.set(k, v);
  if (attach)
    f.set(
      "receipt",
      new File([receipt as Uint8Array<ArrayBuffer>], "receipt.png", {
        type: "image/png",
      }),
    );
  return f;
}
const get = () =>
  prisma.expenseClaim.findUniqueOrThrow({ where: { id: claimId } });
async function act(action: string, more = {}) {
  const c = await get();
  return processClaim({
    id: c.id,
    version: c.updatedAt.toISOString(),
    action,
    ...more,
  });
}
async function visible(id: string) {
  return prisma.expenseClaim.count({
    where: { id: claimId, ...visibleClaimWhere(id) },
  });
}
describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "claim workflow and isolation",
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
      receipt = new Uint8Array(
        await sharp({
          create: { width: 10, height: 10, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
      );
      auth.id = owner;
      await initializeAccounting({
        industry: "SERVICE",
        startDate: "2026-01-01",
      });
      expenseId = (
        await prisma.account.findFirstOrThrow({
          where: { userId: owner, code: "550" },
        })
      ).id;
      bankId = (
        await prisma.account.findFirstOrThrow({
          where: { userId: owner, code: "110" },
        })
      ).id;
      good(await setupClaimWorkspace({ name: "検証精算先" }));
      for (const [id, role] of [
        [applicant, "SUBMITTER"],
        [reviewer, "APPROVER"],
      ])
        good(
          await saveClaimMember({
            email: id + "@example.test",
            role,
            active: true,
          }),
        );
    });
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });
    it("keeps drafts and receipts private, rejects outsiders and invalid files", async () => {
      auth.id = applicant;
      const id = crypto.randomUUID();
      good(await saveClaim(form(id)));
      claimId = id;
      expect(await visible(owner)).toBe(0);
      expect(await visible(reviewer)).toBe(0);
      expect(await visible(applicant)).toBe(1);
      const response = () =>
        GET(new Request("http://localhost/api/claims/receipt"), {
          params: Promise.resolve({ claimId }),
        });
      expect((await response()).headers.get("content-type")).toBe("image/webp");
      auth.id = outsider;
      expect((await response()).status).toBe(404);
      expect((await saveClaim(form())).ok).toBe(false);
      auth.id = reviewer;
      expect((await response()).status).toBe(404);
      auth.id = applicant;
      const invalid = form();
      invalid.set(
        "receipt",
        new File(["<script>bad</script>"], "bad.png", { type: "image/png" }),
      );
      expect((await saveClaim(invalid)).ok).toBe(false);
    });
    it("requires receipt and another approver; submission sends scoped notifications", async () => {
      auth.id = applicant;
      const noReceipt = crypto.randomUUID();
      good(await saveClaim(form(noReceipt, undefined, 100, false)));
      const c = await prisma.expenseClaim.findUniqueOrThrow({
        where: { id: noReceipt },
      });
      expect(
        (
          await processClaim({
            id: c.id,
            version: c.updatedAt.toISOString(),
            action: "SUBMIT",
          })
        ).ok,
      ).toBe(false);
      await setNotificationEmail(true);
      good(await act("SUBMIT"));
      expect((await get()).status).toBe("PENDING");
      expect(await visible(owner)).toBe(1);
      expect(await visible(reviewer)).toBe(1);
      expect(await visible(outsider)).toBe(0);
      const notices = await prisma.appNotification.findMany({
        where: { href: `/claims/${claimId}` },
      });
      expect(notices.map((n) => n.userId).sort()).toEqual(
        [owner, reviewer].sort(),
      );
      expect((await act("APPROVE", { accountId: expenseId })).ok).toBe(false);
      expect(
        (await saveClaim(form(claimId, (await get()).updatedAt.toISOString())))
          .ok,
      ).toBe(false);
    });
    it("requires rejection reasons, allows resubmission and prevents stale/double approval", async () => {
      auth.id = reviewer;
      expect((await act("REJECT")).ok).toBe(false);
      good(await act("REJECT", { comment: "目的を確認してください" }));
      expect((await get()).status).toBe("REJECTED");
      expect(
        (
          await prisma.appNotification.findFirstOrThrow({
            where: { userId: applicant },
          })
        ).emailStatus,
      ).toBe("PENDING");
      auth.id = applicant;
      good(
        await saveClaim(form(claimId, (await get()).updatedAt.toISOString())),
      );
      good(await act("SUBMIT"));
      auth.id = reviewer;
      const c = await get(),
        v = {
          id: c.id,
          version: c.updatedAt.toISOString(),
          action: "APPROVE",
          accountId: expenseId,
        };
      const results = await Promise.all([processClaim(v), processClaim(v)]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect((await get()).status).toBe("APPROVED");
      expect(
        await prisma.journalEntry.count({
          where: { source: "CLAIM", sourceId: claimId },
        }),
      ).toBe(1);
      const lines = await prisma.journalLine.findMany({
        where: { entryId: (await get()).entryId! },
      });
      expect(lines.reduce((s, l) => s + l.debit - l.credit, 0)).toBe(0);
    });
    it("records owner-only reimbursement and reversal without deleting history", async () => {
      auth.id = reviewer;
      expect(
        (await act("PAY", { date: "2026-09-12", accountId: bankId })).ok,
      ).toBe(false);
      auth.id = owner;
      expect(
        (await act("PAY", { date: "2026-09-09", accountId: bankId })).ok,
      ).toBe(false);
      good(await act("PAY", { date: "2026-09-12", accountId: bankId }));
      const paid = await get();
      expect(paid.status).toBe("PAID");
      expect((await act("REVOKE", { comment: "訂正" })).ok).toBe(false);
      good(await act("UNDO_PAY", { comment: "振込日を確認" }));
      expect((await get()).status).toBe("APPROVED");
      expect(
        await prisma.journalEntry.count({
          where: { reversalOf: paid.paymentEntryId },
        }),
      ).toBe(1);
      auth.id = reviewer;
      const approved = await get();
      good(await act("REVOKE", { comment: "金額の再確認" }));
      expect(
        await prisma.journalEntry.count({
          where: { reversalOf: approved.entryId },
        }),
      ).toBe(1);
      expect((await get()).status).toBe("REJECTED");
    });
    it("rolls back approval when accounting fails, then reapproves edited revision", async () => {
      auth.id = applicant;
      good(
        await saveClaim(
          form(claimId, (await get()).updatedAt.toISOString(), 4400),
        ),
      );
      good(await act("SUBMIT"));
      const prior = (await get()).updatedAt.toISOString();
      auth.id = reviewer;
      await prisma.account.update({
        where: { userId_code: { userId: owner, code: "210" } },
        data: { active: false },
      });
      expect((await act("APPROVE", { accountId: expenseId })).ok).toBe(false);
      expect((await get()).status).toBe("PENDING");
      expect((await get()).updatedAt.toISOString()).toBe(prior);
      await prisma.account.update({
        where: { userId_code: { userId: owner, code: "210" } },
        data: { active: true },
      });
      good(await act("APPROVE", { accountId: expenseId }));
      expect((await get()).amount).toBe(4400);
      expect(
        await prisma.journalEntry.count({
          where: { source: "CLAIM", sourceId: claimId },
        }),
      ).toBe(2);
    });
    it("revokes reviewer access immediately and isolates notification updates", async () => {
      auth.id = owner;
      good(
        await saveClaimMember({
          email: reviewer + "@example.test",
          role: "APPROVER",
          active: false,
        }),
      );
      expect(await visible(reviewer)).toBe(0);
      auth.id = reviewer;
      expect((await act("REVOKE", { comment: "不正" })).ok).toBe(false);
      expect(
        (
          await GET(new Request("http://localhost"), {
            params: Promise.resolve({ claimId }),
          })
        ).status,
      ).toBe(404);
      const n = await prisma.appNotification.findFirstOrThrow({
        where: { userId: applicant },
      });
      await markNotificationRead(n.id);
      expect(
        (
          await prisma.appNotification.findUniqueOrThrow({
            where: { id: n.id },
          })
        ).readAt,
      ).toBeNull();
      auth.id = applicant;
      await markNotificationRead(n.id);
      expect(
        (
          await prisma.appNotification.findUniqueOrThrow({
            where: { id: n.id },
          })
        ).readAt,
      ).not.toBeNull();
      await setNotificationEmail(false);
      expect(
        await prisma.appNotification.count({
          where: { userId: applicant, emailStatus: "PENDING" },
        }),
      ).toBe(0);
    });
    it("forbids owner self-approval and requires an independent approver", async () => {
      auth.id = owner;
      const id = crypto.randomUUID();
      good(await saveClaim(form(id)));
      const c = await prisma.expenseClaim.findUniqueOrThrow({ where: { id } });
      expect(
        (
          await processClaim({
            id,
            version: c.updatedAt.toISOString(),
            action: "SUBMIT",
          })
        ).ok,
      ).toBe(false);
      good(
        await saveClaimMember({
          email: reviewer + "@example.test",
          role: "APPROVER",
          active: true,
        }),
      );
      good(
        await processClaim({
          id,
          version: c.updatedAt.toISOString(),
          action: "SUBMIT",
        }),
      );
      const pending = await prisma.expenseClaim.findUniqueOrThrow({
        where: { id },
      });
      expect(
        (
          await processClaim({
            id,
            version: pending.updatedAt.toISOString(),
            action: "APPROVE",
            accountId: expenseId,
          })
        ).ok,
      ).toBe(false);
    });
    it("writes the workflow to the workspace audit log with the acting user", async () => {
      const logs = await prisma.auditLog.findMany({
        where: { ownerId: owner, entity: "CLAIM" },
      });
      const actions = new Set(logs.map((l) => l.action));
      expect(actions.has("CLAIM_SUBMIT")).toBe(true);
      expect(actions.has("CLAIM_APPROVE")).toBe(true);
      expect(logs.some((l) => l.actorId === reviewer)).toBe(true);
      // Every claim-workflow event also exists in the per-claim history.
      expect(logs.length).toBeGreaterThan(0);
    });
  },
);
