import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ id: "expense-test-owner-a" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  saveExpense,
  listExpenses,
  getExpense,
} from "@/actions/expense-actions";
import { japanToday } from "@/lib/expenses/model";
const id = "21111111-1111-4111-8111-111111111111";
function form(extra: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id,
    supplier: "テスト制作会社",
    description: "テスト支払",
    category: "外注費",
    amount: "110000",
    costMonth: "2026-09",
    dueDate: "2026-10-31",
    paidDate: "",
    note: "",
    ...extra,
  }))
    f.set(k, v);
  return f;
}
describe.skipIf(process.env.RUN_EXPENSE_DB_TESTS !== "1")(
  "isolated PostgreSQL expense integration",
  () => {
    beforeAll(async () => {
      for (const id of ["expense-test-owner-a", "expense-test-owner-b"])
        await prisma.user.create({
          data: {
            id,
            name: "TEST",
            email: `${id}@example.test`,
            passwordHash: "test-only-not-login",
          },
        });
    });
    afterAll(async () => {
      await purgeAudit(["expense-test-owner-a", "expense-test-owner-b"]);
      await prisma.user.deleteMany({
        where: { id: { in: ["expense-test-owner-a", "expense-test-owner-b"] } },
      });
      await prisma.$disconnect();
    });
    it("creates once, saves PDF atomically, marks paid, rejects stale writes and isolates owners", async () => {
      const f = form();
      f.set(
        "pdf",
        new File(["%PDF-1.7\n%%EOF"], "receipt.pdf", {
          type: "application/pdf",
        }),
      );
      expect(await saveExpense(f)).toMatchObject({ ok: true, id });
      expect(await saveExpense(f)).toMatchObject({ ok: true, id });
      expect(await prisma.expense.count({ where: { id } })).toBe(1);
      const first = (await getExpense(id))!;
      expect(first.filename).toBe("receipt.pdf");
      expect(first.paidDate).toBeNull();
      expect(await listExpenses()).toHaveLength(1);
      auth.id = "expense-test-owner-b";
      expect(await getExpense(id)).toBeNull();
      expect(await listExpenses()).toEqual([]);
      expect(await saveExpense(form({ version: first.version }))).toMatchObject(
        { ok: false },
      );
      expect(await saveExpense(form())).toMatchObject({ ok: false });
      auth.id = "expense-test-owner-a";
      expect(
        await saveExpense(
          form({ version: first.version, paidDate: japanToday() }),
        ),
      ).toMatchObject({ ok: true });
      const paid = (await getExpense(id))!;
      expect(paid.paidDate).toBe(japanToday());
      expect(await saveExpense(form({ version: first.version }))).toMatchObject(
        { ok: false },
      );
      expect(
        await saveExpense(
          form({ version: paid.version, removeAttachment: "true" }),
        ),
      ).toMatchObject({ ok: true });
      expect((await getExpense(id))?.filename).toBeNull();
      expect((await getExpense(id))?.paidDate).toBeNull();
      expect(
        await prisma.expenseAttachment.count({ where: { expenseId: id } }),
      ).toBe(0);
    });
  },
);
