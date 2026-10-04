import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  normalizeSender,
  notYetThisMonth,
  receivedRows,
  shiftMonthText,
  summarizeBySender,
  validMonthText,
  type ReceivedRow,
} from "@/lib/accounting/received";

const owner = "recv-test-owner",
  member = "recv-test-member",
  stranger = "recv-test-stranger",
  users = [owner, member, stranger];
const bytes = new Uint8Array([37, 80, 68, 70]);

async function cleanup() {
  await prisma.claimEvent.deleteMany({ where: { actorId: { in: users } } });
  await prisma.expenseClaim.deleteMany({ where: { ownerId: owner } });
  await prisma.claimWorkspace.deleteMany({ where: { ownerId: owner } });
  await purgeAudit(users);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.evidenceHistory.deleteMany({ where: { ownerId: { in: users } } });
    await tx.evidenceFile.deleteMany({ where: { ownerId: { in: users } } });
  });
  await prisma.expense.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}

describe("received documents (pure helpers)", () => {
  it("validates and shifts months", () => {
    expect(validMonthText("2026-09")).toBe(true);
    expect(["2026-13", "2026-9", "x", ""].some(validMonthText)).toBe(false);
    expect(shiftMonthText("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthText("2026-12", 1)).toBe("2027-01");
  });
  const row = (
    sender: string,
    kind: "INVOICE" | "RECEIPT",
    at: string,
    amount = 100,
    hasFile = true,
  ): ReceivedRow => ({
    key: sender + at + kind,
    kind,
    label: "",
    sender,
    month: "2026-09",
    receivedAt: new Date(at),
    amount,
    hasFile,
    fileHref: null,
    status: "",
    href: "",
    registeredBy: null,
  });
  it("counts the same person once, even with width/space differences", () => {
    expect(normalizeSender(" 山田　太郎 ")).toBe(normalizeSender("山田 太郎"));
    const s = summarizeBySender([
      row("山田 太郎", "INVOICE", "2026-09-01T00:00:00Z", 1000),
      row("山田　太郎", "RECEIPT", "2026-09-03T00:00:00Z", 500, false),
      row("佐藤", "INVOICE", "2026-09-02T00:00:00Z", 200),
    ]);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({
      invoices: 1,
      receipts: 1,
      amount: 1500,
      withoutFile: 1,
    });
  });
  it("finds who sent last month but not yet this month", () => {
    const prev = [
      row("山田", "INVOICE", "2026-08-05T00:00:00Z"),
      row("佐藤", "INVOICE", "2026-08-06T00:00:00Z"),
    ];
    const cur = [row("山田", "INVOICE", "2026-09-05T00:00:00Z")];
    expect(notYetThisMonth(cur, prev)).toEqual(["佐藤"]);
    expect(notYetThisMonth([], [])).toEqual([]);
  });
});

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "receivedRows",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const [id, name] of [
        [owner, "管理者"],
        [member, "山田太郎"],
        [stranger, "部外者"],
      ])
        await prisma.user.create({
          data: {
            id,
            name,
            email: id + "@example.test",
            passwordHash: "no-login",
          },
        });
      await prisma.claimWorkspace.create({
        data: { ownerId: owner, name: "テスト精算先" },
      });
      await prisma.claimMember.create({
        data: { ownerId: owner, userId: member, role: "SUBMITTER" },
      });
      const claim = (id: string, status: string, merchant: string) =>
        prisma.expenseClaim.create({
          data: {
            id,
            ownerId: owner,
            applicantId: member,
            title: "交通費",
            merchant,
            date: new Date("2026-09-10"),
            amount: 1200,
            category: "交通費",
            note: "",
            status,
            receipt: {
              create: {
                filename: "r.pdf",
                mimeType: "application/pdf",
                data: bytes,
              },
            },
          },
        });
      await claim(
        "11111111-1111-4111-8111-111111111111",
        "PENDING",
        "テスト鉄道",
      );
      await claim(
        "22222222-2222-4222-8222-222222222222",
        "DRAFT",
        "下書きの店",
      );
      const e = await prisma.expense.create({
        data: {
          userId: owner,
          supplier: "佐藤デザイン",
          description: "9月分",
          category: "業務委託報酬",
          amount: 110000,
          costMonth: "2026-09",
          dueDate: new Date("2026-09-30"),
          note: "",
          attachment: { create: { filename: "inv.pdf", data: bytes } },
        },
      });
      await prisma.expense.create({
        data: {
          userId: owner,
          supplier: "添付なし商店",
          description: "x",
          category: "その他",
          amount: 500,
          costMonth: "2026-09",
          dueDate: new Date("2026-09-30"),
          note: "",
        },
      });
      await prisma.expense.create({
        data: {
          userId: owner,
          supplier: "10月の請求",
          description: "x",
          category: "その他",
          amount: 1,
          costMonth: "2026-10",
          dueDate: new Date("2026-10-30"),
          note: "",
        },
      });
      const ev = (over: Record<string, unknown>) =>
        prisma.evidenceFile.create({
          data: {
            ownerId: owner,
            uploadedById: owner,
            kind: "RECEIPT",
            transactionDate: new Date("2026-09-15"),
            amount: 3000,
            counterparty: "証憑の店",
            counterpartyKey: "証憑の店",
            filename: "e.pdf",
            mimeType: "application/pdf",
            size: 4,
            sha256: crypto.randomUUID().replaceAll("-", "").padEnd(64, "0"),
            data: bytes,
            ...over,
          },
        });
      await ev({});
      await ev({
        status: "VOID",
        voidReason: "誤登録",
        voidedAt: new Date(),
        voidedById: owner,
        counterparty: "無効の店",
      });
      await ev({ kind: "CONTRACT", counterparty: "契約書の店" });
      await ev({
        sourceType: "EXPENSE",
        sourceId: e.id,
        counterparty: "佐藤デザイン",
      });
    });
    afterAll(cleanup);

    it("combines invoices, claim receipts and evidence for the month, newest first", async () => {
      const rows = await receivedRows(
        prisma,
        { ownerId: owner, userId: owner },
        "2026-09",
      );
      expect(rows.map((r) => r.sender).sort()).toEqual(
        ["佐藤デザイン", "山田太郎", "添付なし商店", "証憑の店"].sort(),
      );
      expect(
        rows.every(
          (r, i) => i === 0 || +rows[i - 1].receivedAt >= +r.receivedAt,
        ),
      ).toBe(true);
      const by = (s: string) => rows.find((r) => r.sender === s)!;
      expect(by("佐藤デザイン")).toMatchObject({
        kind: "INVOICE",
        month: "2026-09",
        hasFile: true,
        fileHref: expect.stringContaining("/api/expenses/"),
      });
      expect(by("添付なし商店")).toMatchObject({
        hasFile: false,
        fileHref: null,
      });
      expect(by("山田太郎")).toMatchObject({
        kind: "RECEIPT",
        label: "領収書（経費精算）",
        amount: 1200,
        status: "承認待ち",
      });
      expect(by("証憑の店")).toMatchObject({
        kind: "RECEIPT",
        registeredBy: "管理者",
      });
    });
    it("leaves out drafts, voided or other-kind evidence, other months, and expense copies kept in the evidence box", async () => {
      const rows = await receivedRows(
        prisma,
        { ownerId: owner, userId: owner },
        "2026-09",
      );
      const names = rows.map((r) => r.sender);
      for (const n of ["下書きの店", "無効の店", "契約書の店", "10月の請求"])
        expect(names).not.toContain(n);
      expect(names.filter((n) => n === "佐藤デザイン")).toHaveLength(1);
      expect(
        (
          await receivedRows(
            prisma,
            { ownerId: owner, userId: owner },
            "2026-10",
          )
        ).map((r) => r.sender),
      ).toEqual(["10月の請求"]);
    });
    it("shows other workspaces nothing", async () => {
      expect(
        await receivedRows(
          prisma,
          { ownerId: stranger, userId: stranger },
          "2026-09",
        ),
      ).toEqual([]);
    });
    it("does not show claims of others to a user who may not see them", async () => {
      const rows = await receivedRows(
        prisma,
        { ownerId: owner, userId: stranger },
        "2026-09",
      );
      expect(
        rows.some((r) => r.kind === "RECEIPT" && r.label.includes("経費精算")),
      ).toBe(false);
    });
  },
);
