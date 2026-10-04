import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "sub-test-owner" }));
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
  approveSubmission,
  deleteSubmission,
  rejectSubmission,
  saveSubmission,
  saveSubmitterProfile,
  submitSubmission,
  withdrawSubmission,
} from "@/actions/submission-actions";
import { buildReceiptPackage, receivedRows } from "@/lib/accounting/received";

const owner = "sub-test-owner",
  approver = "sub-test-approver",
  worker = "sub-test-worker",
  other = "sub-test-other",
  users = [owner, approver, worker, other];
const as = (id: string) => {
  auth.id = id;
};
const pdf = (t: string) =>
  new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${t}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
const item = (over: Record<string, unknown> = {}) => ({
  kind: "REWARD",
  name: "9月分 業務委託料",
  quantity: 1,
  unitPrice: 150000,
  taxCategory: "TAXABLE_10",
  note: "",
  ...over,
});
const form = (
  id: string,
  items = [item()],
  files: File[] = [],
  extra: Record<string, unknown> = {},
) => {
  const f = new FormData();
  f.set(
    "payload",
    JSON.stringify({
      id,
      month: "2026-09",
      title: "9月分の請求書",
      note: "",
      items,
      ...extra,
    }),
  );
  for (const file of files) f.append("files", file);
  return f;
};
const receipt = (t = "r1") =>
  new File([pdf(t) as Uint8Array<ArrayBuffer>], `${t}.pdf`, {
    type: "application/pdf",
  });
const get = (id: string) =>
  prisma.submission.findUniqueOrThrow({
    where: { id },
    include: { items: true, files: true },
  });
const ver = async (id: string) => (await get(id)).updatedAt.toISOString();
const ok = async <T extends { ok: boolean }>(p: Promise<T>) => {
  const r = await p;
  expect(r).toMatchObject({ ok: true });
  return r;
};
const err = async (p: Promise<{ ok: boolean; error?: string }>) => {
  const r = await p;
  expect(r.ok).toBe(false);
  return (r as { error: string }).error;
};

async function cleanup() {
  await purgeAudit(users);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.evidenceHistory.deleteMany({ where: { ownerId: { in: users } } });
    await tx.evidenceFile.deleteMany({ where: { ownerId: { in: users } } });
  });
  await prisma.accountingSource.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.journalEntry.deleteMany({ where: { userId: { in: users } } });
  await prisma.expense.deleteMany({ where: { userId: { in: users } } });
  await prisma.submission.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.submitterProfile.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.workspaceMember.deleteMany({
    where: { ownerId: { in: users } },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "contractor submissions",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of users)
        await prisma.user.create({
          data: {
            id,
            name: id === worker ? "山田太郎" : id,
            email: id + "@example.test",
            passwordHash: "no-login",
          },
        });
      for (const [userId, role] of [
        [approver, "APPROVER"],
        [worker, "SUBMITTER"],
        [other, "SUBMITTER"],
      ])
        await prisma.workspaceMember.create({
          data: { ownerId: owner, userId, role },
        });
      as(owner);
      await initializeAccounting({
        startDate: "2026-01-01",
        industry: "SERVICE",
      });
    });
    afterAll(cleanup);

    const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    it("saves the contractor's own information, and checks the registration number", async () => {
      as(worker);
      expect(
        await err(
          saveSubmitterProfile({
            legalName: "山田太郎",
            registrationNumber: "123",
          }),
        ),
      ).toMatch(/登録番号/);
      await ok(
        saveSubmitterProfile({
          legalName: "山田太郎",
          address: "東京都",
          registrationNumber: "T1234567890123",
          bankName: "サンプル銀行",
          branchName: "渋谷",
          accountType: "普通",
          accountNumber: "1234567",
          accountHolder: "ヤマダタロウ",
        }),
      );
      expect(
        await prisma.submitterProfile.findUnique({ where: { userId: worker } }),
      ).toMatchObject({ ownerId: owner, legalName: "山田太郎" });
    });

    it("creates a draft with computed totals, and cannot submit expenses without a receipt", async () => {
      as(worker);
      await ok(
        saveSubmission(
          form(A, [
            item(),
            item({
              kind: "TRANSPORT",
              name: "電車代",
              unitPrice: 3000,
              taxCategory: "EXEMPT",
            }),
          ]),
        ),
      );
      const d = await get(A);
      expect(d).toMatchObject({
        status: "DRAFT",
        subtotal: 153000,
        taxAmount: 15000,
        total: 168000,
        submitterId: worker,
        ownerId: owner,
      });
      expect(d.items).toHaveLength(2);
      expect(
        await err(submitSubmission({ id: A, version: await ver(A) })),
      ).toMatch(/領収書/);
    });

    it("submits with a receipt: snapshots the sender and notifies approvers (not the submitter)", async () => {
      as(worker);
      await ok(
        saveSubmission(
          form(
            A,
            [
              item(),
              item({
                kind: "TRANSPORT",
                name: "電車代",
                unitPrice: 3000,
                taxCategory: "EXEMPT",
              }),
            ],
            [receipt()],
            { version: await ver(A) },
          ),
        ),
      );
      expect((await get(A)).files).toHaveLength(1);
      await ok(submitSubmission({ id: A, version: await ver(A) }));
      const s = await get(A);
      expect(s).toMatchObject({
        status: "SUBMITTED",
        senderName: "山田太郎",
        senderRegistration: "T1234567890123",
      });
      expect(s.senderBank).toContain("サンプル銀行");
      const notified = (
        await prisma.appNotification.findMany({
          where: { eventKey: { startsWith: `submission:${A}:submitted` } },
        })
      )
        .map((n) => n.userId)
        .sort();
      expect(notified).toEqual([approver, owner].sort());
    });

    it("shows the pending submission in the received-documents list (but keeps it out of the month-end package)", async () => {
      const rows = await receivedRows(
        prisma,
        { ownerId: owner, userId: owner },
        "2026-09",
      );
      const row = rows.find((r) => r.key === `submission:${A}`);
      expect(row).toMatchObject({
        kind: "INVOICE",
        sender: "山田太郎",
        amount: 168000,
        status: "承認待ち",
        hasFile: true,
      });
      expect(row?.fileHref).toContain(`/api/submissions/${A}/files/`);
      const pack = await buildReceiptPackage(
        prisma,
        { ownerId: owner, userId: owner },
        "2026-09",
        { includeInvoices: true },
      );
      expect(pack.entries.some((e) => e.name.includes("山田太郎"))).toBe(false);
    });

    it("locks editing once submitted; withdrawing returns it to a draft the contractor can edit", async () => {
      as(worker);
      expect(
        await err(
          saveSubmission(form(A, [item()], [], { version: await ver(A) })),
        ),
      ).toMatch(/修正できません/);
      expect(await err(deleteSubmission({ id: A }))).toMatch(/取り下げ/);
      await ok(withdrawSubmission({ id: A }));
      expect((await get(A)).status).toBe("DRAFT");
      await ok(
        saveSubmission(
          form(
            A,
            [
              item(),
              item({
                kind: "TRANSPORT",
                name: "電車代",
                unitPrice: 3000,
                taxCategory: "EXEMPT",
              }),
            ],
            [],
            { version: await ver(A) },
          ),
        ),
      );
      expect(await err(withdrawSubmission({ id: A }))).toMatch(/承認待ち/);
    });

    it("keeps submissions private between contractors", async () => {
      as(other);
      await saveSubmitterProfile({ legalName: "別の人" });
      expect(await err(saveSubmission(form(A, [item()])))).toMatch(
        /見つかりません/,
      );
      expect(
        await err(
          submitSubmission({ id: A, version: new Date().toISOString() }),
        ),
      ).toMatch(/見つかりません/);
      expect(await err(deleteSubmission({ id: A }))).toMatch(/見つかりません/);
      expect(await err(withdrawSubmission({ id: A }))).toMatch(
        /見つかりません/,
      );
    });

    it("does not let a contractor approve or reject", async () => {
      as(worker);
      await ok(submitSubmission({ id: A, version: await ver(A) }));
      expect(
        await err(approveSubmission({ id: A, version: await ver(A) })),
      ).toMatch(/権限/);
      expect(
        await err(
          rejectSubmission({ id: A, version: await ver(A), reason: "x" }),
        ),
      ).toMatch(/権限/);
      expect((await get(A)).status).toBe("SUBMITTED");
    });

    it("rejects with a reason, tells the contractor, and lets them fix and resubmit", async () => {
      as(approver);
      expect(
        await err(
          rejectSubmission({ id: A, version: await ver(A), reason: " " }),
        ),
      ).toMatch(/理由/);
      await ok(
        rejectSubmission({
          id: A,
          version: await ver(A),
          reason: "9月の交通費の領収書が不足しています",
        }),
      );
      expect(await get(A)).toMatchObject({
        status: "REJECTED",
        rejectReason: "9月の交通費の領収書が不足しています",
        decidedById: approver,
      });
      expect(
        await prisma.appNotification.count({
          where: {
            userId: worker,
            eventKey: { startsWith: `submission:${A}:rejected` },
          },
        }),
      ).toBe(1);
      as(worker);
      await ok(
        saveSubmission(
          form(
            A,
            [
              item(),
              item({
                kind: "TRANSPORT",
                name: "電車代",
                unitPrice: 3000,
                taxCategory: "EXEMPT",
              }),
            ],
            [receipt("r2")],
            { version: await ver(A) },
          ),
        ),
      );
      expect((await get(A)).status).toBe("DRAFT");
      await ok(submitSubmission({ id: A, version: await ver(A) }));
      expect(await get(A)).toMatchObject({
        status: "SUBMITTED",
        rejectReason: null,
      });
    });

    it("refuses to approve on stale content", async () => {
      as(approver);
      expect(
        await err(
          approveSubmission({ id: A, version: "2020-01-01T00:00:00.000Z" }),
        ),
      ).toMatch(/更新されています/);
    });

    it("on approval creates payments (per kind × tax category), syncs the books and keeps the receipts in the evidence box", async () => {
      as(approver);
      const r = await ok(approveSubmission({ id: A, version: await ver(A) }));
      expect(r).toMatchObject({ expenses: 2 });
      const s = await get(A);
      expect(s).toMatchObject({ status: "APPROVED", decidedById: approver });
      const ex = await prisma.expense.findMany({
        where: { submissionId: A },
        orderBy: { amount: "desc" },
      });
      expect(
        ex.map((e) => [
          e.category,
          e.taxCategory,
          e.amount,
          e.supplier,
          e.costMonth,
        ]),
      ).toEqual([
        ["業務委託報酬", "TAXABLE_10", 165000, "山田太郎", "2026-09"],
        ["交通費", "EXEMPT", 3000, "山田太郎", "2026-09"],
      ]);
      expect(
        await prisma.journalEntry.count({
          where: { userId: owner, source: "EXPENSE" },
        }),
      ).toBe(2);
      const evidence = await prisma.evidenceFile.findMany({
        where: { ownerId: owner, sourceType: "SUBMISSION" },
      });
      expect(evidence).toHaveLength(2); // r1 と r2
      expect(
        evidence.every(
          (e) => e.counterparty === "山田太郎" && e.uploadedById === worker,
        ),
      ).toBe(true);
      expect(
        await prisma.appNotification.count({
          where: {
            userId: worker,
            eventKey: { startsWith: `submission:${A}:approved` },
          },
        }),
      ).toBe(1);
    });

    it("after approval, the received list counts the money once (payments), links the submission's file to them, and puts it in the package once", async () => {
      const rows = await receivedRows(
        prisma,
        { ownerId: owner, userId: owner },
        "2026-09",
      );
      const mine = rows.filter((r) => r.sender === "山田太郎");
      expect(mine.map((r) => r.label).sort()).toEqual([
        "請求書（支払管理）",
        "請求書（支払管理）",
      ]);
      expect(mine.reduce((n, r) => n + r.amount, 0)).toBe(168000); // 証憑のコピーを足して、倍にならない
      expect(
        mine.every(
          (r) => r.hasFile && r.fileHref?.includes("/api/submissions/"),
        ),
      ).toBe(true);
      const pack = await buildReceiptPackage(
        prisma,
        { ownerId: owner, userId: owner },
        "2026-09",
        { includeInvoices: true },
      );
      expect(
        pack.entries.filter((e) => e.name.includes("山田太郎")),
      ).toHaveLength(1);
      const index = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
        pack.entries.find((e) => e.name === "一覧.csv")!.data,
      );
      expect(index).toContain("同じ提出のファイル");
    });

    it("does nothing the second time, and freezes the contractor's edits", async () => {
      as(approver);
      expect(
        await err(approveSubmission({ id: A, version: await ver(A) })),
      ).toMatch(/承認待ち/);
      expect(await prisma.expense.count({ where: { submissionId: A } })).toBe(
        2,
      );
      as(worker);
      expect(
        await err(
          saveSubmission(form(A, [item()], [], { version: await ver(A) })),
        ),
      ).toMatch(/修正できません/);
      expect(await err(withdrawSubmission({ id: A }))).toMatch(/承認待ち/);
      expect(await err(deleteSubmission({ id: A }))).toMatch(/削除できます/);
    });

    it("does not let anyone approve their own submission, and lets a draft be deleted", async () => {
      const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      as(approver);
      await prisma.submitterProfile.upsert({
        where: { userId: approver },
        create: { userId: approver, ownerId: owner, legalName: "承認者本人" },
        update: {},
      });
      await ok(saveSubmission(form(B)));
      await ok(submitSubmission({ id: B, version: await ver(B) }));
      expect(
        await err(approveSubmission({ id: B, version: await ver(B) })),
      ).toMatch(/自分の提出/);
      as(worker);
      const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      await ok(saveSubmission(form(C)));
      await ok(deleteSubmission({ id: C }));
      expect(
        await prisma.submission.findUnique({ where: { id: C } }),
      ).toBeNull();
    });
  },
);
