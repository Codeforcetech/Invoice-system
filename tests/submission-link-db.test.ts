import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "lnk-test-owner" }));
const net = vi.hoisted(() => ({ ip: "203.0.113.1" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ sub: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": net.ip }),
}));
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import { initializeAccounting } from "@/actions/accounting-actions";
import {
  approveSubmission,
  readInvoiceAi,
  rejectSubmission,
} from "@/actions/submission-actions";
import { submissionChecks } from "@/lib/submissions/checks";
import { resetOcrState } from "@/lib/ocr/anthropic";
import {
  createSubmissionLink,
  extendSubmissionLink,
  revokeSubmissionLink,
} from "@/actions/submission-link-actions";
import {
  readInvoiceViaLink,
  resubmitViaLink,
  submitViaLink,
  withdrawViaLink,
} from "@/actions/public-submission-actions";
import {
  TOKEN_PATTERN,
  findActiveLink,
  hashToken,
  linkStatus,
  throttle,
} from "@/lib/submissions/link";

const owner = "lnk-test-owner",
  approver = "lnk-test-approver",
  editor = "lnk-test-editor",
  worker = "lnk-test-worker",
  users = [owner, approver, editor, worker];
const as = (id: string) => {
  auth.id = id;
};
const pdf = (t: string) =>
  new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${t}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
const receipt = (t = "r1") =>
  new File([pdf(t) as Uint8Array<ArrayBuffer>], `${t}.pdf`, {
    type: "application/pdf",
  });
const item = (over: Record<string, unknown> = {}) => ({
  kind: "REWARD",
  name: "9月分 業務委託料",
  quantity: 1,
  unitPrice: 100000,
  taxCategory: "TAXABLE_10",
  note: "",
  ...over,
});
const profile = {
  legalName: "外部 花子",
  address: "東京都",
  phone: "",
  registrationNumber: "T1234567890123",
  bankName: "サンプル銀行",
  branchName: "渋谷",
  accountType: "普通",
  accountNumber: "1234567",
  accountHolder: "ガイブ ハナコ",
};
let n = 0;
const form = (
  token: string,
  over: Record<string, unknown> = {},
  files: File[] = [],
  extra: Record<string, string> = {},
) => {
  const f = new FormData();
  f.set("token", token);
  f.set(
    "payload",
    JSON.stringify({
      id: crypto.randomUUID(),
      month: "2026-09",
      title: "9月分",
      note: "",
      items: [item()],
      profile,
      contactEmail: "",
      ...over,
    }),
  );
  for (const file of files) f.append("files", file);
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
};
/** テストごとに別の送り元（IP）にして、入口の制限が他のテストに影響しないようにする。 */
const freshIp = () => {
  net.ip = `198.51.100.${(++n % 250) + 1}`;
};
const err = async (p: Promise<{ ok: boolean; error?: string }>) => {
  const r = await p;
  expect(r.ok).toBe(false);
  return (r as { error: string }).error;
};
const ok = async <T extends { ok: boolean }>(p: Promise<T>) => {
  const r = await p;
  expect(r).toMatchObject({ ok: true });
  return r as Extract<T, { ok: true }>;
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
  await prisma.submissionLink.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.workspaceMember.deleteMany({
    where: { ownerId: { in: users } },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.publicThrottle.deleteMany({});
}

describe("token helpers", () => {
  it("accepts only the exact token shape, and hashes with SHA-256", () => {
    const t = "A".repeat(43);
    expect(TOKEN_PATTERN.test(t)).toBe(true);
    for (const bad of [
      "",
      "short",
      "A".repeat(42),
      "A".repeat(44),
      "A".repeat(42) + "!",
      "A".repeat(42) + " ",
    ])
      expect(TOKEN_PATTERN.test(bad)).toBe(false);
    expect(hashToken(t)).toBe(createHash("sha256").update(t).digest("hex"));
  });
  it("derives a status from revocation and expiry", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(
      linkStatus({ revokedAt: null, expiresAt: new Date("2026-11-01") }, now),
    ).toBe("ACTIVE");
    expect(
      linkStatus({ revokedAt: null, expiresAt: new Date("2026-09-30") }, now),
    ).toBe("EXPIRED");
    expect(
      linkStatus(
        { revokedAt: new Date(), expiresAt: new Date("2026-11-01") },
        now,
      ),
    ).toBe("REVOKED");
  });
});

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "external submission links",
  () => {
    let token = "",
      linkId = "";
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
        [approver, "APPROVER"],
        [editor, "EDITOR"],
        [worker, "SUBMITTER"],
      ])
        await prisma.workspaceMember.create({
          data: { ownerId: owner, userId, role },
        });
      as(owner);
      await initializeAccounting({
        startDate: "2026-01-01",
        industry: "SERVICE",
      });
      as(approver);
      const r = await ok(
        createSubmissionLink({ label: "外部 花子さん", days: 30, aiReads: 5 }),
      );
      token = r.token;
      linkId = r.id;
    });
    afterAll(cleanup);

    it("lets only approvers and above issue links; stores only a hash of the token", async () => {
      for (const id of [editor, worker]) {
        as(id);
        expect(
          await err(createSubmissionLink({ label: "x", days: 30 })),
        ).toMatch(/権限/);
      }
      as(approver);
      expect(await err(createSubmissionLink({ label: " ", days: 30 }))).toMatch(
        /宛名/,
      );
      expect(await err(createSubmissionLink({ label: "x", days: 5 }))).toMatch(
        /有効期限/,
      );
      expect(token).toMatch(TOKEN_PATTERN);
      const row = await prisma.submissionLink.findUniqueOrThrow({
        where: { id: linkId },
      });
      expect(row.tokenHash).toBe(hashToken(token));
      expect(row.tokenHint).toBe(token.slice(-4));
      expect(JSON.stringify(row)).not.toContain(token);
      expect(+row.expiresAt - Date.now()).toBeGreaterThan(29 * 86_400_000);
      expect(row).toMatchObject({ maxPending: 3, aiReadsLimit: 5 });
    });

    it("treats every unusable link alike: wrong, malformed, revoked, expired", async () => {
      expect(await findActiveLink(prisma, token)).not.toBeNull();
      expect(await findActiveLink(prisma, "B".repeat(43))).toBeNull();
      expect(await findActiveLink(prisma, "zzz")).toBeNull();
      expect(await findActiveLink(prisma, undefined)).toBeNull();
      expect(
        await findActiveLink(
          prisma,
          token,
          new Date(Date.now() + 40 * 86_400_000),
        ),
      ).toBeNull(); // 期限切れ
    });

    it("accepts a submission from a valid link: pending, snapshot, event, audit, notification, counters", async () => {
      freshIp();
      const body = form(
        token,
        {
          items: [
            item(),
            item({
              kind: "TRANSPORT",
              name: "電車代",
              unitPrice: 3000,
              taxCategory: "EXEMPT",
            }),
          ],
          contactEmail: "hanako@example.test",
        },
        [receipt()],
      );
      const id = JSON.parse(String(body.get("payload"))).id as string;
      await ok(submitViaLink(body));
      const s = await prisma.submission.findUniqueOrThrow({
        where: { id },
        include: { items: true, files: true, events: true },
      });
      expect(s).toMatchObject({
        status: "SUBMITTED",
        submitterId: null,
        linkId,
        ownerId: owner,
        senderName: "外部 花子",
        subtotal: 103000,
        taxAmount: 10000,
        total: 113000,
        contactEmail: "hanako@example.test",
      });
      expect(s.files).toHaveLength(1);
      expect(s.events.map((e) => [e.action, e.actorId])).toEqual([
        ["SUBMIT", `link:${linkId}`],
      ]);
      expect(
        await prisma.submissionLink.findUniqueOrThrow({
          where: { id: linkId },
        }),
      ).toMatchObject({
        submissionCount: 1,
        profile: expect.objectContaining({ legalName: "外部 花子" }),
      });
      expect(
        await prisma.auditLog.count({
          where: { ownerId: owner, action: "SUBMISSION_SUBMIT_EXTERNAL" },
        }),
      ).toBe(1);
      const notified = (
        await prisma.appNotification.findMany({
          where: { eventKey: `submission:${id}:submitted:1` },
        })
      )
        .map((x) => x.userId)
        .sort();
      expect(notified).toEqual([approver, owner].sort());
    });

    it("returns the same refusal for a bad token as for a revoked or expired one, and creates nothing", async () => {
      freshIp();
      const before = await prisma.submission.count();
      const wrong = await err(submitViaLink(form("C".repeat(43))));
      const malformed = await err(submitViaLink(form("nope")));
      expect(wrong).toBe(malformed);
      // 取り消し
      as(approver);
      const r2 = await ok(createSubmissionLink({ label: "取り消す", days: 7 }));
      await ok(revokeSubmissionLink({ id: r2.id }));
      expect(await err(submitViaLink(form(r2.token)))).toBe(wrong);
      // 期限切れ
      const r3 = await ok(createSubmissionLink({ label: "期限切れ", days: 7 }));
      await prisma.submissionLink.update({
        where: { id: r3.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect(await err(submitViaLink(form(r3.token)))).toBe(wrong);
      expect(await prisma.submission.count()).toBe(before);
    });

    it("stops after the pending limit, and after the total limit", async () => {
      freshIp();
      as(approver);
      const r = await ok(createSubmissionLink({ label: "上限", days: 30 }));
      for (let i = 0; i < 3; i++) await ok(submitViaLink(form(r.token)));
      expect(await err(submitViaLink(form(r.token)))).toMatch(
        /承認待ちの提出が3件/,
      );
      await prisma.submissionLink.update({
        where: { id: r.id },
        data: { maxSubmissions: 3 },
      });
      await prisma.submission.updateMany({
        where: { linkId: r.id },
        data: { status: "REJECTED", rejectReason: "x" },
      });
      expect(await err(submitViaLink(form(r.token)))).toMatch(
        /これ以上提出できません/,
      );
      expect(await prisma.submission.count({ where: { linkId: r.id } })).toBe(
        3,
      );
    });

    it("does not register a re-sent submission twice, and refuses an id that belongs to another link", async () => {
      freshIp();
      as(approver);
      const a = await ok(createSubmissionLink({ label: "A", days: 30 })),
        b = await ok(createSubmissionLink({ label: "B", days: 30 }));
      const id = crypto.randomUUID();
      await ok(submitViaLink(form(a.token, { id })));
      await ok(submitViaLink(form(a.token, { id })));
      expect(await prisma.submission.count({ where: { id } })).toBe(1);
      expect(await err(submitViaLink(form(b.token, { id })))).toMatch(
        /リンクは使えません/,
      );
    });

    it("validates input plainly, and ignores automated submissions", async () => {
      freshIp();
      as(approver);
      const r = await ok(createSubmissionLink({ label: "検証", days: 30 }));
      expect(
        await err(
          submitViaLink(
            form(r.token, {
              items: [
                item(),
                item({
                  kind: "TRANSPORT",
                  name: "電車代",
                  unitPrice: 3000,
                  taxCategory: "EXEMPT",
                }),
              ],
            }),
          ),
        ),
      ).toMatch(/領収書/);
      expect(
        await err(
          submitViaLink(form(r.token, { contactEmail: "not-an-email" })),
        ),
      ).toMatch(/メールアドレス/);
      expect(
        await err(
          submitViaLink(
            form(r.token, { profile: { ...profile, legalName: " " } }),
          ),
        ),
      ).toBeTruthy();
      expect(
        await err(
          submitViaLink(
            form(r.token, {
              profile: { ...profile, registrationNumber: "12" },
            }),
          ),
        ),
      ).toMatch(/登録番号/);
      expect(
        await err(
          submitViaLink(form(r.token, { items: [item({ unitPrice: 0 })] })),
        ),
      ).toMatch(/金額/);
      expect(
        await err(
          submitViaLink(
            form(r.token, {}, [], { website: "http://spam.example" }),
          ),
        ),
      ).toMatch(/リンクは使えません/);
      expect(
        await err(
          submitViaLink(
            form(r.token, {}, [
              new File([new Uint8Array([1, 2, 3])], "x.pdf", {
                type: "application/pdf",
              }),
            ]),
          ),
        ),
      ).toBeTruthy();
      expect(await prisma.submission.count({ where: { linkId: r.id } })).toBe(
        0,
      );
    });

    it("limits how fast one address can submit", async () => {
      net.ip = "192.0.2.77";
      as(approver);
      const r = await ok(createSubmissionLink({ label: "速度", days: 30 }));
      const results: string[] = [];
      for (let i = 0; i < 22; i++) {
        const res = await submitViaLink(form("D".repeat(43)));
        results.push(res.ok ? "ok" : res.error.slice(0, 6));
      }
      expect(
        results.filter((x) => x === "操作が多すぎ").length,
      ).toBeGreaterThanOrEqual(2);
      void r;
    });

    it("can be extended or revoked only by approvers, and a revoked link cannot be extended back to life", async () => {
      as(editor);
      expect(await err(revokeSubmissionLink({ id: linkId }))).toMatch(/権限/);
      as(approver);
      const r = await ok(createSubmissionLink({ label: "延長", days: 7 }));
      await ok(extendSubmissionLink({ id: r.id, days: 90 }));
      expect(
        +(
          await prisma.submissionLink.findUniqueOrThrow({ where: { id: r.id } })
        ).expiresAt - Date.now(),
      ).toBeGreaterThan(89 * 86_400_000);
      await ok(revokeSubmissionLink({ id: r.id }));
      expect(await err(revokeSubmissionLink({ id: r.id }))).toMatch(
        /取り消され/,
      );
      expect(await err(extendSubmissionLink({ id: r.id, days: 30 }))).toMatch(
        /取り消し済み/,
      );
      expect(await findActiveLink(prisma, r.token)).toBeNull();
    });

    it("is approved like any submission: payments use the sender name, and no member notification is attempted", async () => {
      freshIp();
      as(approver);
      const r = await ok(createSubmissionLink({ label: "承認", days: 30 }));
      const body = form(
        r.token,
        {
          items: [
            item(),
            item({
              kind: "TRANSPORT",
              name: "電車代",
              unitPrice: 3000,
              taxCategory: "EXEMPT",
            }),
          ],
        },
        [receipt("ext")],
      );
      const id = JSON.parse(String(body.get("payload"))).id as string;
      await ok(submitViaLink(body));
      const version = (
        await prisma.submission.findUniqueOrThrow({ where: { id } })
      ).updatedAt.toISOString();
      expect(await ok(approveSubmission({ id, version }))).toMatchObject({
        expenses: 2,
      });
      const ex = await prisma.expense.findMany({
        where: { submissionId: id },
        orderBy: { amount: "desc" },
      });
      expect(ex.map((e) => [e.supplier, e.category, e.amount])).toEqual([
        ["外部 花子", "業務委託報酬", 110000],
        ["外部 花子", "交通費", 3000],
      ]);
      const ev = await prisma.evidenceFile.findFirstOrThrow({
        where: {
          ownerId: owner,
          sourceType: "SUBMISSION",
          memo: { contains: "9月分" },
        },
      });
      expect(ev.uploadedById).toBe(approver);
      expect(
        await prisma.appNotification.count({
          where: { eventKey: { startsWith: `submission:${id}:approved` } },
        }),
      ).toBe(0);
    });

    it("lets the sender withdraw, fix and resubmit before approval (replacing items and files), and only on their own link", async () => {
      freshIp();
      as(approver);
      const a = await ok(createSubmissionLink({ label: "出し直し", days: 30 })),
        b = await ok(createSubmissionLink({ label: "別の人", days: 30 }));
      const body = form(
        a.token,
        {
          items: [
            item(),
            item({
              kind: "TRANSPORT",
              name: "電車代",
              unitPrice: 3000,
              taxCategory: "EXEMPT",
            }),
          ],
        },
        [receipt("old")],
      );
      const id = JSON.parse(String(body.get("payload"))).id as string;
      await ok(submitViaLink(body));
      // 他のリンクからは、取り下げも出し直しもできない
      expect(await err(withdrawViaLink({ token: b.token, id }))).toMatch(
        /リンクは使えません/,
      );
      // 取り下げ → 直せる状態（DRAFT）
      await ok(withdrawViaLink({ token: a.token, id }));
      expect(
        (await prisma.submission.findUniqueOrThrow({ where: { id } })).status,
      ).toBe("DRAFT");
      expect(await err(withdrawViaLink({ token: a.token, id }))).toMatch(
        /承認待ちの提出だけ/,
      );
      const oldFile = (
        await prisma.submissionFile.findFirstOrThrow({
          where: { submissionId: id },
        })
      ).id;
      // 出し直し：金額を変え、古い領収書を外して新しいものを足す
      const fix = form(
        a.token,
        {
          id,
          items: [
            item({ unitPrice: 120000 }),
            item({
              kind: "TRANSPORT",
              name: "電車代",
              unitPrice: 3000,
              taxCategory: "EXEMPT",
            }),
          ],
        },
        [receipt("new")],
        { removeFiles: JSON.stringify([oldFile]) },
      );
      await ok(resubmitViaLink(fix));
      const s = await prisma.submission.findUniqueOrThrow({
        where: { id },
        include: { items: true, files: true, events: true },
      });
      expect(s).toMatchObject({
        status: "SUBMITTED",
        subtotal: 123000,
        total: 135000,
      });
      expect(s.files.map((f) => f.filename)).toEqual(["new.pdf"]);
      expect(s.events.map((e) => e.action)).toEqual([
        "SUBMIT",
        "WITHDRAW",
        "SUBMIT",
      ]);
      // 承認待ちのものは、出し直しではなく取り下げてから
      expect(await err(resubmitViaLink(form(a.token, { id })))).toMatch(
        /取り下げた提出、または差し戻された提出だけ/,
      );
      // 他のリンクの提出は、出し直せない
      expect(await err(resubmitViaLink(form(b.token, { id })))).toMatch(
        /リンクは使えません/,
      );
    });

    it("keeps the pending limit on resubmission, and refuses once the link is revoked", async () => {
      freshIp();
      as(approver);
      const r = await ok(
        createSubmissionLink({ label: "再提出の上限", days: 30 }),
      );
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const b = form(r.token);
        ids.push(JSON.parse(String(b.get("payload"))).id);
        await ok(submitViaLink(b));
      }
      await ok(withdrawViaLink({ token: r.token, id: ids[0] }));
      const extra = form(r.token);
      await ok(submitViaLink(extra)); // 空いた1件分に、別の提出
      expect(await err(resubmitViaLink(form(r.token, { id: ids[0] })))).toMatch(
        /承認待ちの提出が3件/,
      );
      await ok(revokeSubmissionLink({ id: r.id }));
      expect(await err(resubmitViaLink(form(r.token, { id: ids[0] })))).toMatch(
        /リンクは使えません/,
      );
      expect(
        await err(withdrawViaLink({ token: r.token, id: ids[1] })),
      ).toMatch(/リンクは使えません/);
    });

    it("emails the sender on approval and rejection when mail is set up, and records the result; a failed email never undoes the decision", async () => {
      freshIp();
      vi.stubEnv("RESEND_API_KEY", "re_test_not_real");
      vi.stubEnv("NOTIFICATION_FROM_EMAIL", "noreply@example.test");
      vi.stubEnv("NOTIFICATION_APP_URL", "https://app.example.test");
      const sent: {
        to: string[];
        subject: string;
        text: string;
        key: string;
      }[] = [];
      let fail = false;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_u: string, init: RequestInit) => {
          if (fail) return new Response("x", { status: 400 });
          const b = JSON.parse(String(init.body));
          sent.push({
            to: b.to,
            subject: b.subject,
            text: b.text,
            key: (init.headers as Record<string, string>)["Idempotency-Key"],
          });
          return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
        }),
      );
      try {
        as(approver);
        const r = await ok(createSubmissionLink({ label: "メール", days: 30 }));
        const mk = async (over: Record<string, unknown>) => {
          const b = form(r.token, over);
          const id = JSON.parse(String(b.get("payload"))).id as string;
          await ok(submitViaLink(b));
          return id;
        };
        const ver = async (id: string) =>
          (
            await prisma.submission.findUniqueOrThrow({ where: { id } })
          ).updatedAt.toISOString();
        const note = async (id: string) =>
          (
            await prisma.submissionEvent.findFirst({
              where: { submissionId: id, action: "MAIL" },
            })
          )?.note ?? "";

        const a = await mk({ contactEmail: "hanako@example.test" });
        await ok(approveSubmission({ id: a, version: await ver(a) }));
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({
          to: ["hanako@example.test"],
          subject: expect.stringContaining("承認されました"),
        });
        expect(sent[0].text).not.toContain("http"); // リンク（トークン）は、メールに入れない
        expect(await note(a)).toMatch(/通知しました/);

        const b = await mk({ contactEmail: "hanako@example.test" });
        await ok(
          rejectSubmission({
            id: b,
            version: await ver(b),
            reason: "金額を確認してください",
          }),
        );
        expect(sent[1].subject).toContain("差し戻されました");
        expect(sent[1].text).toContain("金額を確認してください");
        expect(sent[1].key).toContain(`/${b}/REJECT/`);

        const c = await mk({}); // メールアドレスなし
        await ok(approveSubmission({ id: c, version: await ver(c) }));
        expect(sent).toHaveLength(2);
        expect(await note(c)).toMatch(/送っていません/);

        fail = true;
        const d = await mk({ contactEmail: "hanako@example.test" });
        await ok(approveSubmission({ id: d, version: await ver(d) })); // メールが失敗しても、承認は成立
        expect(
          (await prisma.submission.findUniqueOrThrow({ where: { id: d } }))
            .status,
        ).toBe("APPROVED");
        expect(await note(d)).toMatch(/失敗/);
      } finally {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
      }
    });

    describe("AI reading of invoices", () => {
      const aiJson = JSON.stringify({
        senderName: "AI 太郎",
        address: "東京都",
        registrationNumber: "T1234567890123",
        bank: { bankName: "AI銀行" },
        month: "2026-09",
        title: "9月分",
        amountsIncludeTax: false,
        total: 110000,
        items: [
          {
            name: "制作",
            quantity: 1,
            unitPrice: 100000,
            taxRate: 10,
            kind: "REWARD",
          },
        ],
      });
      const stub = (status = 200, body = aiJson) => {
        const f = vi.fn(
          async () =>
            new Response(
              JSON.stringify({ content: [{ type: "text", text: body }] }),
              { status },
            ),
        );
        vi.stubGlobal("fetch", f);
        return f;
      };
      const readForm = (
        token: string,
        file: File | null = receipt("inv"),
        extra: Record<string, string> = { consent: "1" },
      ) => {
        const f = new FormData();
        f.set("token", token);
        if (file) f.set("file", file);
        for (const [k, v] of Object.entries(extra)) f.set(k, v);
        return f;
      };
      const used = async (id: string) =>
        (await prisma.submissionLink.findUniqueOrThrow({ where: { id } }))
          .aiReadsUsed;
      const setup = async (aiReads = 5) => {
        freshIp();
        resetOcrState();
        vi.stubEnv("ANTHROPIC_API_KEY", "k-not-real");
        as(approver);
        return ok(createSubmissionLink({ label: "AI", days: 30, aiReads }));
      };
      const finish = () => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
        resetOcrState();
      };

      it("needs the sender's consent, a valid link and a file; uses no count when AI is not configured", async () => {
        const r = await setup();
        try {
          stub();
          expect(
            await err(readInvoiceViaLink(readForm(r.token, receipt(), {}))),
          ).toMatch(/同意/);
          expect(
            await err(readInvoiceViaLink(readForm("E".repeat(43)))),
          ).toMatch(/リンクは使えません/);
          expect(
            await err(readInvoiceViaLink(readForm(r.token, null))),
          ).toMatch(/ファイル/);
          vi.stubEnv("ANTHROPIC_API_KEY", "");
          expect(await readInvoiceViaLink(readForm(r.token))).toMatchObject({
            ok: false,
            unconfigured: true,
          });
          expect(await used(r.id)).toBe(0);
        } finally {
          finish();
        }
      });

      it("reads an invoice into a draft, counts the use, and keeps nothing saved", async () => {
        const r = await setup();
        try {
          const f = stub();
          const before = await prisma.submission.count({
            where: { linkId: r.id },
          });
          const res = await readInvoiceViaLink(readForm(r.token));
          expect(res).toMatchObject({ ok: true, duplicate: false, left: 4 });
          expect(res.ok && res.data.profile.legalName).toBe("AI 太郎");
          expect(res.ok && res.data.items[0]).toMatchObject({
            unitPrice: 100000,
            taxCategory: "TAXABLE_10",
          });
          expect(await used(r.id)).toBe(1);
          expect(f).toHaveBeenCalledTimes(1);
          expect(
            await prisma.submission.count({ where: { linkId: r.id } }),
          ).toBe(before);
        } finally {
          finish();
        }
      });

      it("limits readings per link, and gives the count back when the failure is not the sender's fault", async () => {
        const r = await setup(2);
        try {
          stub();
          await ok(readInvoiceViaLink(readForm(r.token)));
          await ok(readInvoiceViaLink(readForm(r.token)));
          expect(await readInvoiceViaLink(readForm(r.token))).toMatchObject({
            ok: false,
            error: expect.stringMatching(/回数を超えました/),
          });
          expect(await used(r.id)).toBe(2);
          // 混雑で失敗 → 回数は戻る
          const r2 = await setup(2);
          stub(503);
          const sleepless = await readInvoiceViaLink(readForm(r2.token));
          expect(sleepless).toMatchObject({ ok: false, retryable: true });
          expect(await used(r2.id)).toBe(0);
          // 読み取れなかった（画像のせい）→ 回数は戻さない
          const r3 = await setup(2);
          stub(200, "読めません");
          expect(await readInvoiceViaLink(readForm(r3.token))).toMatchObject({
            ok: false,
          });
          expect(await used(r3.id)).toBe(1);
        } finally {
          finish();
        }
      });

      it("stops at the workspace's daily limit", async () => {
        const r = await setup();
        try {
          stub();
          await prisma.publicThrottle.deleteMany({});
          vi.stubEnv("INVOICE_OCR_DAILY_LIMIT", "1");
          await ok(readInvoiceViaLink(readForm(r.token)));
          expect(await readInvoiceViaLink(readForm(r.token))).toMatchObject({
            ok: false,
            error: expect.stringMatching(/本日.*上限/),
          });
          expect(await used(r.id)).toBe(1); // 2回目は回数を戻している
        } finally {
          finish();
        }
      });

      it("tells the sender when the same file was already submitted on this link, but not about other links", async () => {
        const r = await setup();
        const other = await ok(createSubmissionLink({ label: "別", days: 30 }));
        try {
          stub();
          await ok(submitViaLink(form(r.token, {}, [receipt("same")])));
          expect(
            await readInvoiceViaLink(readForm(r.token, receipt("same"))),
          ).toMatchObject({ ok: true, duplicate: true });
          expect(
            await readInvoiceViaLink(readForm(other.token, receipt("same"))),
          ).toMatchObject({ ok: true, duplicate: false });
        } finally {
          finish();
        }
      });

      it("works for a contractor member too (consent required, nothing saved)", async () => {
        freshIp();
        resetOcrState();
        vi.stubEnv("ANTHROPIC_API_KEY", "k-not-real");
        try {
          stub();
          as(worker);
          const mk = (extra: Record<string, string>) => {
            const f = new FormData();
            f.set("file", receipt("m1"));
            for (const [k, v] of Object.entries(extra)) f.set(k, v);
            return f;
          };
          expect(await err(readInvoiceAi(mk({})))).toMatch(/同意/);
          expect(await readInvoiceAi(mk({ consent: "1" }))).toMatchObject({
            ok: true,
          });
          as(approver);
          expect(await readInvoiceAi(mk({ consent: "1" }))).toMatchObject({
            ok: true,
          }); // 上位の役割も使える
        } finally {
          finish();
        }
      });

      it("keeps the AI flag on the submission, and shows reviewers the checks (AI note, same file, same sender/month/amount)", async () => {
        const r = await setup();
        try {
          const f1 = form(
            r.token,
            { aiAssisted: true, aiNote: "税込から換算" },
            [receipt("dup")],
          );
          const id1 = JSON.parse(String(f1.get("payload"))).id as string;
          await ok(submitViaLink(f1));
          const f2 = form(r.token, {}, [receipt("dup")]);
          const id2 = JSON.parse(String(f2.get("payload"))).id as string;
          await ok(submitViaLink(f2));
          const load = (id: string) =>
            prisma.submission.findUniqueOrThrow({
              where: { id },
              include: { files: { select: { id: true } } },
            });
          const s1 = await load(id1);
          expect(s1).toMatchObject({
            aiAssisted: true,
            aiNote: "税込から換算",
          });
          const c1 = await submissionChecks(prisma, owner, s1);
          expect(c1.join("|")).toMatch(/同じファイル/);
          expect(c1.join("|")).toMatch(/同じ差出人・同じ月・同じ金額/);
          expect(c1.join("|")).toMatch(/AI読み取りを使いました.*税込から換算/);
          const c2 = await submissionChecks(prisma, owner, await load(id2));
          expect(c2.join("|")).not.toMatch(/AI読み取り/);
        } finally {
          finish();
        }
      });
    });

    it("counts requests per window and resets after it", async () => {
      const t0 = new Date("2026-10-01T00:00:00Z");
      const key = `unit-${crypto.randomUUID()}`;
      expect(await throttle(prisma, "u", key, 2, 60_000, t0)).toBe(true);
      expect(
        await throttle(prisma, "u", key, 2, 60_000, new Date(+t0 + 1000)),
      ).toBe(true);
      expect(
        await throttle(prisma, "u", key, 2, 60_000, new Date(+t0 + 2000)),
      ).toBe(false);
      expect(
        await throttle(prisma, "u", key, 2, 60_000, new Date(+t0 + 61_000)),
      ).toBe(true);
    });
  },
);
