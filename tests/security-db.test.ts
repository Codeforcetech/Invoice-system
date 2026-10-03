import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The route compares against a dummy hash for unknown addresses. Keep that step, but make it cheap here.
vi.mock("@/lib/auth/password", async (original) => {
  const bcrypt = (await import("bcryptjs")).default;
  const hash = bcrypt.hashSync("never-used", 4);
  return {
    ...(await original<typeof import("@/lib/auth/password")>()),
    dummyPasswordHash: async () => hash,
  };
});
import { prisma } from "@/lib/db/prisma";
import bcrypt from "bcryptjs";
import { throttleKey } from "@/lib/auth/throttle";
import { purgeAudit } from "./audit-cleanup";
import { POST as login } from "@/app/api/auth/login/route";
import { getInvoiceByShareToken } from "@/actions/invoice-share-actions";

const user = "sec-test-user";
const email = "sec-test-user@example.test";
const password = "Correct-Horse-2026!";
const emails = [
  email,
  "sec-test-nobody@example.test",
  "sec-test-other@example.test",
];

const attempt = async (e: string, p: string) => {
  const fd = new FormData();
  fd.set("email", e);
  fd.set("password", p);
  const res = await login(
    new Request("http://127.0.0.1/api/auth/login", {
      method: "POST",
      body: fd,
    }),
  );
  return {
    location: res.headers.get("Location") ?? "",
    cookie: res.headers.get("set-cookie") ?? "",
  };
};
const forget = () =>
  prisma.loginThrottle.deleteMany({
    where: {
      key: {
        in: emails.flatMap((e) => [
          throttleKey(e),
          throttleKey(e.toUpperCase()),
        ]),
      },
    },
  });

async function cleanup() {
  await forget();
  await purgeAudit([user]);
  await prisma.invoice.deleteMany({ where: { createdById: user } });
  await prisma.company.deleteMany({ where: { userId: user } });
  await prisma.user.deleteMany({ where: { id: user } });
}

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "sign-in throttling",
  () => {
    beforeAll(async () => {
      await cleanup();
      await prisma.user.create({
        data: {
          id: user,
          name: user,
          email,
          // Low cost on purpose: this test signs in dozens of times. The route reads the cost from the hash.
          passwordHash: await bcrypt.hash(password, 4),
        },
      });
    });
    afterAll(cleanup);

    it("locks the address after five wrong passwords, and the answer stays the same until then", async () => {
      await forget();
      for (let i = 1; i <= 4; i++)
        expect((await attempt(email, "wrong-" + i)).location).toContain(
          "error=invalid",
        );
      expect((await attempt(email, "wrong-5")).location).toContain(
        "error=locked",
      );
      expect(
        await prisma.auditLog.count({
          where: { actorId: user, action: "LOGIN_LOCKED" },
        }),
      ).toBe(1);
    });

    it("refuses even the correct password while locked, and sets no session", async () => {
      const r = await attempt(email, password);
      expect(r.location).toContain("error=locked");
      expect(r.cookie).not.toContain("invoice_session");
    });

    it("lets the person in again once the lock has passed, and clears the count", async () => {
      await prisma.loginThrottle.update({
        where: { key: throttleKey(email) },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      const r = await attempt(email, password);
      expect(r.location).toBe("/dashboard");
      expect(r.cookie).toContain("invoice_session");
      expect(
        await prisma.loginThrottle.count({
          where: { key: throttleKey(email) },
        }),
      ).toBe(0);
    });

    it("a successful sign-in resets the counter", async () => {
      await forget();
      for (let i = 0; i < 4; i++) await attempt(email, "wrong");
      expect((await attempt(email, password)).location).toBe("/dashboard");
      for (let i = 0; i < 4; i++)
        expect((await attempt(email, "wrong")).location).toContain(
          "error=invalid",
        );
    });

    it("counts attempts regardless of upper or lower case in the address", async () => {
      await forget();
      for (let i = 0; i < 4; i++)
        await attempt(i % 2 ? email.toUpperCase() : email, "wrong");
      expect((await attempt(email, "wrong")).location).toContain(
        "error=locked",
      );
    });

    it("treats an address with no account the same way, so accounts cannot be told apart", async () => {
      const unknown = "sec-test-nobody@example.test";
      await forget();
      const answers: string[] = [];
      for (let i = 0; i < 5; i++)
        answers.push((await attempt(unknown, "guess-" + i)).location);
      expect(
        answers.slice(0, 4).every((l) => l.includes("error=invalid")),
      ).toBe(true);
      expect(answers[4]).toContain("error=locked");
      // No account, so nothing is written to anyone's operation log for it.
      expect(
        await prisma.loginThrottle.count({
          where: { key: throttleKey(unknown) },
        }),
      ).toBe(1);
    });

    it("starts counting again when the earlier failures are older than the window", async () => {
      await forget();
      for (let i = 0; i < 3; i++) await attempt(email, "wrong");
      await prisma.loginThrottle.update({
        where: { key: throttleKey(email) },
        data: { firstFailedAt: new Date(Date.now() - 16 * 60 * 1000) },
      });
      for (let i = 0; i < 3; i++)
        expect((await attempt(email, "wrong")).location).toContain(
          "error=invalid",
        );
    });

    it("does not store the address itself, only a hash", async () => {
      await forget();
      await attempt(email, "wrong");
      const rows = await prisma.loginThrottle.findMany();
      expect(JSON.stringify(rows)).not.toContain("sec-test-user");
    });
  },
);

describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "public invoice links",
  () => {
    const base = {
      subject: "共有確認",
      issueDate: new Date("2026-09-01"),
      dueDate: new Date("2026-09-30"),
      subtotal: 1000,
      taxRate: 1000,
      taxAmount: 100,
      totalWithTax: 1100,
      withholdingTax: 0,
      grandTotal: 1100,
      createdById: user,
    };
    let companyId: string;
    beforeAll(async () => {
      await cleanup();
      await prisma.user.create({
        data: { id: user, name: user, email, passwordHash: "x" },
      });
      companyId = (
        await prisma.company.create({
          data: { userId: user, name: "共有取引先", invoiceCode: "SHR" },
        })
      ).id;
      await prisma.invoice.createMany({
        data: [
          {
            ...base,
            companyId,
            invoiceNumber: "SEC-ISSUED",
            status: "ISSUED",
            shareToken: "tok-issued",
          },
          {
            ...base,
            companyId,
            invoiceNumber: "SEC-DRAFT",
            status: "DRAFT",
            shareToken: "tok-draft",
          },
          {
            ...base,
            companyId,
            invoiceNumber: "SEC-CONFIRMED",
            status: "CONFIRMED",
            shareToken: "tok-confirmed",
          },
        ],
      });
      const target = await prisma.invoice.findFirstOrThrow({
        where: { invoiceNumber: "SEC-ISSUED" },
      });
      await prisma.invoice.create({
        data: {
          ...base,
          companyId,
          invoiceNumber: "SEC-MERGED",
          status: "ISSUED",
          shareToken: "tok-merged",
          mergedIntoId: target.id,
        },
      });
    });
    afterAll(cleanup);

    it("shows an issued invoice by its token", async () => {
      expect((await getInvoiceByShareToken("tok-issued"))?.invoiceNumber).toBe(
        "SEC-ISSUED",
      );
    });

    it("never shows drafts, unissued or merged invoices, nor an unknown or blank token", async () => {
      for (const t of [
        "tok-draft",
        "tok-confirmed",
        "tok-merged",
        "tok-unknown",
        "",
        "  ",
      ])
        expect(await getInvoiceByShareToken(t)).toBeNull();
    });
  },
);
