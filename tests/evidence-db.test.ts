import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ id: "evid-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ sub: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import sharp from "sharp";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  correctEvidence,
  saveExpenseAttachmentToBox,
  uploadEvidence,
  voidEvidence,
} from "@/actions/evidence-actions";
import { getExpense, saveExpense } from "@/actions/expense-actions";
import { searchEvidence } from "@/lib/evidence/search";
import { evidenceSearchSchema } from "@/lib/evidence/model";
import { GET as download } from "@/app/api/evidence/[evidenceId]/route";

const owner = "evid-test-owner",
  editor = "evid-test-editor",
  viewer = "evid-test-viewer",
  approver = "evid-test-approver",
  outsider = "evid-test-outsider",
  users = [owner, editor, viewer, approver, outsider];

/** A small but real PDF (header, body and %%EOF). */
const pdf = (text: string) =>
  new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${text}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
const file = (bytes: Uint8Array, name: string, type = "application/pdf") =>
  new File([bytes as Uint8Array<ArrayBuffer>], name, { type });
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const form = (f: File | null, over: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({
    kind: "RECEIPT",
    transactionDate: "2026-09-10",
    amount: "5500",
    counterparty: "株式会社テスト商事",
    memo: "",
    ...over,
  }))
    fd.set(k, v);
  if (f) fd.set("file", f);
  return fd;
};
const search = (q: Record<string, string> = {}) =>
  searchEvidence(prisma, owner, evidenceSearchSchema.parse(q));
const as = (id: string) => {
  auth.id = id;
};
const ok = async <T extends { ok: boolean }>(p: Promise<T>) => {
  const r = await p;
  expect(r).toMatchObject({ ok: true });
  return r as Extract<T, { ok: true }>;
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
  await prisma.journalEntry.deleteMany({ where: { userId: { in: users } } });
  await prisma.accountingSource.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.expenseAttachment.deleteMany({
    where: { expense: { userId: { in: users } } },
  });
  await prisma.expense.deleteMany({ where: { userId: { in: users } } });
  await prisma.workspaceMember.deleteMany({
    where: { ownerId: { in: users } },
  });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "evidence file box",
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
        [approver, "APPROVER"],
      ])
        await prisma.workspaceMember.create({
          data: { ownerId: owner, userId, role },
        });
    });
    afterAll(cleanup);

    it("stores a PDF exactly as received, with its hash, history and audit entry", async () => {
      as(editor);
      const bytes = pdf("original");
      const { id } = await ok(
        uploadEvidence(
          form(file(bytes, "領収書 2026-09.pdf"), { memo: "9月分" }),
        ),
      );
      const row = await prisma.evidenceFile.findUniqueOrThrow({
        where: { id },
      });
      expect(Buffer.from(row.data).equals(Buffer.from(bytes))).toBe(true);
      expect(row.sha256).toBe(sha(bytes));
      expect(row).toMatchObject({
        ownerId: owner,
        uploadedById: editor,
        mimeType: "application/pdf",
        size: bytes.length,
        filename: "領収書 2026-09.pdf",
        status: "ACTIVE",
        amount: 5500,
        counterparty: "株式会社テスト商事",
      });
      const history = await prisma.evidenceHistory.findMany({
        where: { evidenceId: id },
      });
      expect(history.map((h) => [h.action, h.actorId])).toEqual([
        ["UPLOAD", editor],
      ]);
      expect(
        await prisma.auditLog.count({
          where: {
            ownerId: owner,
            action: "EVIDENCE_UPLOAD",
            entityId: id,
            actorId: editor,
          },
        }),
      ).toBe(1);
    });

    it("stores an image without re-encoding it", async () => {
      as(editor);
      const png = new Uint8Array(
        await sharp({
          create: { width: 30, height: 20, channels: 3, background: "#fff" },
        })
          .png()
          .toBuffer(),
      );
      const { id } = await ok(
        uploadEvidence(
          form(file(png, "scan.png", "image/png"), {
            counterparty: "画像商店",
          }),
        ),
      );
      const row = await prisma.evidenceFile.findUniqueOrThrow({
        where: { id },
      });
      expect(row.mimeType).toBe("image/png");
      expect(Buffer.from(row.data).equals(Buffer.from(png))).toBe(true);
    });

    it("decides the type by content, not by what the browser says", async () => {
      as(editor);
      const { id } = await ok(
        uploadEvidence(
          form(file(pdf("typeless"), "no-type.pdf", ""), {
            counterparty: "種類不明商会",
          }),
        ),
      );
      expect(
        (await prisma.evidenceFile.findUniqueOrThrow({ where: { id } }))
          .mimeType,
      ).toBe("application/pdf");
    });

    it("rejects bad files and bad input with a clear message", async () => {
      as(editor);
      expect(await err(uploadEvidence(form(null)))).toMatch(/ファイルを選択/);
      expect(
        await err(uploadEvidence(form(file(new Uint8Array(0), "empty.pdf")))),
      ).toMatch(/空/);
      expect(
        await err(
          uploadEvidence(
            form(
              file(new TextEncoder().encode("hello"), "note.txt", "text/plain"),
            ),
          ),
        ),
      ).toMatch(/PDF・JPEG・PNG・WebP/);
      expect(
        await err(
          uploadEvidence(
            form(
              file(new TextEncoder().encode("%PDF-1.4\nno end"), "broken.pdf"),
            ),
          ),
        ),
      ).toMatch(/PDFの形式/);
      const png = new Uint8Array(
        await sharp({
          create: { width: 4, height: 4, channels: 3, background: "#000" },
        })
          .png()
          .toBuffer(),
      );
      expect(await err(uploadEvidence(form(file(png, "fake.pdf"))))).toMatch(
        /拡張子|形式/,
      );
      const big = new Uint8Array(3 * 1024 * 1024 + 1);
      big.set(pdf("big"));
      expect(await err(uploadEvidence(form(file(big, "big.pdf"))))).toMatch(
        /3MB/,
      );
      const good = file(pdf("fields"), "f.pdf");
      expect(
        await err(uploadEvidence(form(good, { counterparty: " " }))),
      ).toMatch(/取引先/);
      expect(await err(uploadEvidence(form(good, { amount: "-1" })))).toMatch(
        /0円以上/,
      );
      expect(await err(uploadEvidence(form(good, { amount: "12.5" })))).toMatch(
        /整数/,
      );
      expect(
        await err(
          uploadEvidence(form(good, { transactionDate: "2099-01-01" })),
        ),
      ).toMatch(/今日以前/);
      expect(
        await err(
          uploadEvidence(form(good, { transactionDate: "2026-02-30" })),
        ),
      ).toBeTruthy();
      expect(await err(uploadEvidence(form(good, { kind: "OTHER2" })))).toMatch(
        /種類/,
      );
    });

    it("refuses the same file twice, but allows it again once the first is voided", async () => {
      as(editor);
      const bytes = pdf("duplicate");
      const first = await ok(
        uploadEvidence(
          form(file(bytes, "a.pdf"), { counterparty: "重複商事" }),
        ),
      );
      expect(
        await err(
          uploadEvidence(
            form(file(bytes, "b.pdf"), { counterparty: "重複商事" }),
          ),
        ),
      ).toMatch(/すでに/);
      as(approver);
      const v = (
        await prisma.evidenceFile.findUniqueOrThrow({ where: { id: first.id } })
      ).updatedAt.toISOString();
      await ok(voidEvidence({ id: first.id, version: v, reason: "誤登録" }));
      as(editor);
      await ok(
        uploadEvidence(
          form(file(bytes, "c.pdf"), { counterparty: "重複商事" }),
        ),
      );
    });

    describe("search", () => {
      beforeAll(async () => {
        as(editor);
        const rows = [
          ["INVOICE", "2026-08-05", "110000", "ＡＢＣ商事株式会社", "s1"],
          ["INVOICE", "2026-08-20", "33000", "abc商事 株式会社", "s2"],
          ["RECEIPT", "2026-09-01", "1200", "コンビニ", "s3"],
          ["CONTRACT", "2026-07-15", "0", "山田 太郎", "s4"],
          ["RECEIPT", "2026-09-30", "98000", "ＡＢＣ商事株式会社", "s5"],
        ];
        for (const [kind, transactionDate, amount, counterparty, text] of rows)
          await ok(
            uploadEvidence(
              form(file(pdf("search-" + text), `${text}.pdf`), {
                kind,
                transactionDate,
                amount,
                counterparty,
              }),
            ),
          );
      });
      const names = async (q: Record<string, string>) =>
        (await search(q)).rows.map((r) => r.filename).sort();

      it("filters by a date range", async () => {
        expect(await names({ from: "2026-08-01", to: "2026-08-31" })).toEqual([
          "s1.pdf",
          "s2.pdf",
        ]);
        expect(
          await names({
            from: "2026-09-30",
            to: "2026-09-30",
            counterparty: "ABC",
          }),
        ).toEqual(["s5.pdf"]);
      });

      it("filters by an amount range, including 0 and open-ended ranges", async () => {
        expect(
          await names({
            amountMin: "30000",
            amountMax: "100000",
            counterparty: "abc",
          }),
        ).toEqual(["s2.pdf", "s5.pdf"]);
        expect(
          await names({ amountMax: "0", from: "2026-07-01", to: "2026-07-31" }),
        ).toEqual(["s4.pdf"]);
        expect(
          await names({ amountMin: "100000", counterparty: "abc" }),
        ).toEqual(["s1.pdf"]);
      });

      it("finds a counterparty regardless of width, case and spaces", async () => {
        expect(await names({ counterparty: "abc商事" })).toEqual([
          "s1.pdf",
          "s2.pdf",
          "s5.pdf",
        ]);
        expect(await names({ counterparty: "ＡＢＣ　商事" })).toEqual([
          "s1.pdf",
          "s2.pdf",
          "s5.pdf",
        ]);
        expect(await names({ counterparty: "やまだ" })).toEqual([]);
        expect(await names({ counterparty: "山田太郎" })).toEqual(["s4.pdf"]);
      });

      it("combines any of the items with the type", async () => {
        expect(
          await names({
            kind: "INVOICE",
            counterparty: "abc",
            from: "2026-08-10",
            to: "2026-12-31",
          }),
        ).toEqual(["s2.pdf"]);
        expect(
          await names({
            kind: "RECEIPT",
            amountMin: "50000",
            counterparty: "abc",
          }),
        ).toEqual(["s5.pdf"]);
      });

      it("hides voided files by default and shows them on request", async () => {
        const target = (await search({ counterparty: "コンビニ" })).rows[0];
        as(approver);
        await ok(
          voidEvidence({
            id: target.id,
            version: target.updatedAt.toISOString(),
            reason: "テスト",
          }),
        );
        expect(await names({ counterparty: "コンビニ" })).toEqual([]);
        expect(
          await names({ counterparty: "コンビニ", status: "VOID" }),
        ).toEqual(["s3.pdf"]);
        expect(
          await names({ counterparty: "コンビニ", status: "ALL" }),
        ).toEqual(["s3.pdf"]);
      });

      it("pages the results and reports the total", async () => {
        const r = await search({ page: "1" });
        expect(r.total).toBeGreaterThan(5);
        expect(r.rows.length).toBeLessThanOrEqual(50);
        expect((await search({ page: "99" })).rows).toEqual([]);
      });

      it("never includes the file contents in the list", async () => {
        expect(Object.keys((await search()).rows[0])).not.toContain("data");
      });

      it("does not show another workspace's files", async () => {
        expect(
          (
            await searchEvidence(
              prisma,
              outsider,
              evidenceSearchSchema.parse({}),
            )
          ).total,
        ).toBe(0);
      });
    });

    describe("correction and voiding", () => {
      let id: string;
      beforeAll(async () => {
        as(editor);
        id = (
          await ok(
            uploadEvidence(
              form(file(pdf("to-correct"), "fix.pdf"), {
                counterparty: "訂正前商事",
                amount: "1000",
              }),
            ),
          )
        ).id;
      });
      const version = async () =>
        (
          await prisma.evidenceFile.findUniqueOrThrow({ where: { id } })
        ).updatedAt.toISOString();
      const meta = (over: Record<string, unknown> = {}) => ({
        kind: "RECEIPT",
        transactionDate: "2026-09-10",
        amount: 1000,
        counterparty: "訂正前商事",
        memo: "",
        ...over,
      });

      it("records before, after and the reason, and the search finds the new values", async () => {
        as(editor);
        await ok(
          correctEvidence({
            id,
            version: await version(),
            reason: "金額の入力誤り",
            ...meta({ amount: 11000, counterparty: "訂正後商事" }),
          }),
        );
        const h = await prisma.evidenceHistory.findMany({
          where: { evidenceId: id },
          orderBy: { createdAt: "asc" },
        });
        expect(h.map((x) => x.action)).toEqual(["UPLOAD", "CORRECT"]);
        expect(h[1]).toMatchObject({
          actorId: editor,
          reason: "金額の入力誤り",
        });
        expect(h[1].before).toMatchObject({
          amount: 1000,
          counterparty: "訂正前商事",
        });
        expect(h[1].after).toMatchObject({
          amount: 11000,
          counterparty: "訂正後商事",
        });
        expect(
          (await search({ counterparty: "訂正後" })).rows.map((r) => r.id),
        ).toContain(id);
        expect((await search({ counterparty: "訂正前" })).rows).toEqual([]);
        // The file itself did not change.
        expect(
          sha(
            (await prisma.evidenceFile.findUniqueOrThrow({ where: { id } }))
              .data,
          ),
        ).toBe(sha(pdf("to-correct")));
      });

      it("requires a reason, a real change and an up-to-date screen", async () => {
        as(editor);
        const current = meta({ amount: 11000, counterparty: "訂正後商事" });
        expect(
          await err(
            correctEvidence({
              id,
              version: await version(),
              reason: " ",
              ...current,
            }),
          ),
        ).toMatch(/理由/);
        expect(
          await err(
            correctEvidence({
              id,
              version: await version(),
              reason: "同じ",
              ...current,
            }),
          ),
        ).toMatch(/変更がありません/);
        expect(
          await err(
            correctEvidence({
              id,
              version: "2020-01-01T00:00:00.000Z",
              reason: "古い",
              ...meta({ amount: 1 }),
            }),
          ),
        ).toMatch(/更新されて/);
      });

      it("only an approver can void; a viewer and an outsider cannot see or change it", async () => {
        as(editor);
        expect(
          await err(
            voidEvidence({ id, version: await version(), reason: "権限なし" }),
          ),
        ).toMatch(/承認可/);
        as(viewer);
        expect(
          await err(
            correctEvidence({
              id,
              version: await version(),
              reason: "x",
              ...meta({ amount: 2 }),
            }),
          ),
        ).toMatch(/入力可/);
        as(outsider);
        expect(
          await err(
            voidEvidence({ id, version: await version(), reason: "他人" }),
          ),
        ).toMatch(/承認可|見つかりません/);
        expect(
          (await prisma.evidenceFile.findUniqueOrThrow({ where: { id } }))
            .status,
        ).toBe("ACTIVE");
        as(approver);
        await ok(
          voidEvidence({ id, version: await version(), reason: "取引の取消" }),
        );
        const row = await prisma.evidenceFile.findUniqueOrThrow({
          where: { id },
        });
        expect(row).toMatchObject({
          status: "VOID",
          voidedById: approver,
          voidReason: "取引の取消",
        });
        expect(sha(row.data)).toBe(sha(pdf("to-correct")));
        expect(
          await err(
            voidEvidence({ id, version: await version(), reason: "もう一度" }),
          ),
        ).toMatch(/すでに無効/);
        as(editor);
        expect(
          await err(
            correctEvidence({
              id,
              version: await version(),
              reason: "無効後",
              ...meta({ amount: 3 }),
            }),
          ),
        ).toMatch(/無効/);
      });
    });

    describe("protection in the database", () => {
      let id: string;
      beforeAll(async () => {
        as(editor);
        id = (
          await ok(
            uploadEvidence(
              form(file(pdf("protected"), "protected.pdf"), {
                counterparty: "保護商事",
              }),
            ),
          )
        ).id;
      });

      it("never lets the stored file change", async () => {
        for (const data of [
          { data: pdf("tampered") },
          { sha256: "0".repeat(64) },
          { filename: "other.pdf" },
          { mimeType: "image/png" },
          { size: 1 },
          { ownerId: outsider },
          { uploadedById: outsider },
          { sourceType: "EXPENSE", sourceId: "x" },
        ])
          await expect(
            prisma.evidenceFile.update({ where: { id }, data: data as never }),
          ).rejects.toThrow(/cannot be changed/);
      });

      it("never lets an evidence file be deleted", async () => {
        await expect(
          prisma.evidenceFile.delete({ where: { id } }),
        ).rejects.toThrow(/cannot be deleted/);
      });

      it("never lets a voided file come back", async () => {
        as(approver);
        const v = (
          await prisma.evidenceFile.findUniqueOrThrow({ where: { id } })
        ).updatedAt.toISOString();
        await ok(voidEvidence({ id, version: v, reason: "保護テスト" }));
        await expect(
          prisma.evidenceFile.update({
            where: { id },
            data: { status: "ACTIVE", voidedAt: null, voidReason: null },
          }),
        ).rejects.toThrow();
      });

      it("keeps the history append-only", async () => {
        const h = await prisma.evidenceHistory.findFirstOrThrow({
          where: { evidenceId: id },
        });
        await expect(
          prisma.evidenceHistory.update({
            where: { id: h.id },
            data: { reason: "改ざん" },
          }),
        ).rejects.toThrow(/append-only/);
        await expect(
          prisma.evidenceHistory.delete({ where: { id: h.id } }),
        ).rejects.toThrow(/append-only/);
      });

      it("rejects an unknown kind, a negative amount and a malformed hash", async () => {
        const base = {
          ownerId: owner,
          uploadedById: owner,
          kind: "RECEIPT",
          transactionDate: new Date("2026-09-01"),
          amount: 1,
          counterparty: "x",
          counterpartyKey: "x",
          filename: "x.pdf",
          mimeType: "application/pdf",
          size: 1,
          sha256: "a".repeat(64),
          data: pdf("db"),
        };
        await expect(
          prisma.evidenceFile.create({
            data: { ...base, kind: "BAD", sha256: "b".repeat(64) },
          }),
        ).rejects.toThrow();
        await expect(
          prisma.evidenceFile.create({
            data: { ...base, amount: -1, sha256: "c".repeat(64) },
          }),
        ).rejects.toThrow();
        await expect(
          prisma.evidenceFile.create({
            data: { ...base, sha256: "NOT-A-HASH" },
          }),
        ).rejects.toThrow();
      });
    });

    describe("download", () => {
      const get = (evidenceId: string) =>
        download(new Request("http://127.0.0.1/api/evidence/" + evidenceId), {
          params: Promise.resolve({ evidenceId }),
        });
      it("returns the original bytes with safe headers, for any member, and logs it", async () => {
        as(editor);
        const bytes = pdf("download");
        const { id } = await ok(
          uploadEvidence(
            form(file(bytes, "ダウンロード.pdf"), { counterparty: "配信商事" }),
          ),
        );
        as(viewer);
        const res = await get(id);
        expect(res.status).toBe(200);
        expect(
          Buffer.from(await res.arrayBuffer()).equals(Buffer.from(bytes)),
        ).toBe(true);
        expect(res.headers.get("Content-Type")).toBe("application/pdf");
        expect(res.headers.get("Content-Disposition")).toMatch(/^attachment;/);
        expect(res.headers.get("Content-Disposition")).toContain(
          encodeURIComponent("ダウンロード.pdf"),
        );
        expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
        expect(res.headers.get("Cache-Control")).toContain("no-store");
        expect(
          await prisma.auditLog.count({
            where: {
              ownerId: owner,
              action: "EVIDENCE_DOWNLOAD",
              entityId: id,
              actorId: viewer,
            },
          }),
        ).toBe(1);
      });

      it("hides files from other workspaces and from anyone not signed in", async () => {
        const id = (
          await prisma.evidenceFile.findFirstOrThrow({
            where: { ownerId: owner },
          })
        ).id;
        as(outsider);
        expect((await get(id)).status).toBe(404);
        expect((await get("not/valid")).status).toBe(404);
        expect((await get("missing-id")).status).toBe(404);
      });
    });

    describe("saving an expense's attached PDF", () => {
      const expenseId = "99111111-1111-4111-8111-111111111111";
      const expenseForm = (attach: boolean, version?: string) => {
        const f = new FormData();
        for (const [k, v] of Object.entries({
          id: expenseId,
          supplier: "仕入先株式会社",
          description: "9月分の仕入",
          category: "仕入",
          amount: "44000",
          costMonth: "2026-09",
          dueDate: "2026-09-30",
          paidDate: "",
          note: "",
          ...(version ? { version } : {}),
        }))
          f.set(k, v);
        if (attach) f.set("pdf", file(pdf("expense-pdf"), "請求書.pdf"));
        return f;
      };

      it("copies the original PDF with the payment's supplier and amount, once", async () => {
        as(editor);
        await ok(saveExpense(expenseForm(false)));
        expect(
          await err(
            saveExpenseAttachmentToBox({
              expenseId,
              kind: "INVOICE",
              transactionDate: "2026-09-25",
            }),
          ),
        ).toMatch(/添付されていません/);
        await ok(
          saveExpense(
            expenseForm(true, (await getExpense(expenseId))!.version),
          ),
        );
        const { id } = await ok(
          saveExpenseAttachmentToBox({
            expenseId,
            kind: "INVOICE",
            transactionDate: "2026-09-25",
          }),
        );
        const row = await prisma.evidenceFile.findUniqueOrThrow({
          where: { id },
        });
        expect(row).toMatchObject({
          kind: "INVOICE",
          amount: 44000,
          counterparty: "仕入先株式会社",
          sourceType: "EXPENSE",
          sourceId: expenseId,
          filename: "請求書.pdf",
        });
        expect(sha(row.data)).toBe(sha(pdf("expense-pdf")));
        // The expense's own attachment is untouched.
        expect(
          await prisma.expenseAttachment.count({ where: { expenseId } }),
        ).toBe(1);
        expect(
          await err(
            saveExpenseAttachmentToBox({
              expenseId,
              kind: "INVOICE",
              transactionDate: "2026-09-25",
            }),
          ),
        ).toMatch(/すでに/);
        as(viewer);
        expect(
          await err(
            saveExpenseAttachmentToBox({
              expenseId,
              kind: "INVOICE",
              transactionDate: "2026-09-25",
            }),
          ),
        ).toMatch(/入力可/);
        as(outsider);
        expect(
          await err(
            saveExpenseAttachmentToBox({
              expenseId,
              kind: "INVOICE",
              transactionDate: "2026-09-25",
            }),
          ),
        ).toMatch(/見つかりません/);
      });
    });
  },
);
