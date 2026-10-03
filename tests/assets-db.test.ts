import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const auth = vi.hoisted(() => ({ id: "asset-test-owner" }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: async () => ({ id: auth.id }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { prisma } from "@/lib/db/prisma";
import { purgeAudit } from "./audit-cleanup";
import {
  initializeAccounting,
  saveAccount,
} from "@/actions/accounting-actions";
import {
  prepareAssetAccounts,
  saveAsset,
  postDepreciation,
  cancelDepreciation,
  archiveAsset,
} from "@/actions/asset-actions";
const users = ["asset-test-owner", "asset-test-other"];
let assetAccountId: string, expenseAccountId: string, otherAccountId: string;
const data = (extra = {}) => ({
  id: crypto.randomUUID(),
  name: "設備",
  acquiredDate: "2020-01-01",
  serviceDate: "2020-01-01",
  cost: 1000000,
  method: "DECLINING",
  usefulLife: 5,
  fiscalStartMonth: 1,
  assetAccountId,
  expenseAccountId,
  note: "",
  ...extra,
});
const good = (r: { ok: boolean; error?: string }) => {
  expect(r.error).toBeUndefined();
  expect(r.ok).toBe(true);
};
const asset = (id: string) =>
  prisma.fixedAsset.findUniqueOrThrow({ where: { id } });
const post = async (
  id: string,
  year: number,
  month = `${year}-01`,
  mode = "YEAR",
) =>
  postDepreciation({
    id,
    year,
    month,
    mode,
    version: (await asset(id)).updatedAt.toISOString(),
  });
async function cleanup() {
  await prisma.depreciationPosting.deleteMany({
    where: { userId: { in: users } },
  });
  await prisma.fixedAsset.deleteMany({ where: { userId: { in: users } } });
  await prisma.journalEntry.deleteMany({ where: { userId: { in: users } } });
  await purgeAudit(users);
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}
describe.skipIf(process.env.RUN_ACCOUNTING_DB_TESTS !== "1")(
  "fixed assets database",
  () => {
    beforeAll(async () => {
      await cleanup();
      for (const id of users) {
        await prisma.user.create({
          data: {
            id,
            name: "test",
            email: `${id}@example.test`,
            passwordHash: "no-login",
          },
        });
        auth.id = id;
        await initializeAccounting({
          startDate: "2020-01-01",
          industry: "SERVICE",
        });
        good(await prepareAssetAccounts());
      }
      auth.id = users[0];
      assetAccountId = (
        await prisma.account.findUniqueOrThrow({
          where: { userId_code: { userId: auth.id, code: "150" } },
        })
      ).id;
      expenseAccountId = (
        await prisma.account.findUniqueOrThrow({
          where: { userId_code: { userId: auth.id, code: "DEP" } },
        })
      ).id;
      otherAccountId = (
        await prisma.account.findUniqueOrThrow({
          where: { userId_code: { userId: users[1], code: "150" } },
        })
      ).id;
    });
    afterAll(async () => {
      await cleanup();
      await prisma.$disconnect();
    });
    it("posts balanced month and remaining annual amount without overlaps; reverses and reposts", async () => {
      const d = data();
      good(await saveAsset(d));
      expect((await post(d.id, 2021)).ok).toBe(false); // preceding year missing
      good(await post(d.id, 2020, "2020-01", "MONTH"));
      good(await post(d.id, 2020));
      const postings = await prisma.depreciationPosting.findMany({
        where: { assetId: d.id, active: true },
        include: { entry: { include: { lines: true } } },
      });
      expect(postings).toHaveLength(12);
      expect(postings.reduce((s, p) => s + p.amount, 0)).toBe(400000);
      expect(
        postings.every(
          (p) =>
            p.entry.lines.reduce((s, l) => s + l.debit - l.credit, 0) === 0,
        ),
      ).toBe(true);
      expect(await post(d.id, 2020)).toMatchObject({ ok: true, count: 0 });
      const jan = postings.find((p) => p.month === "2020-01")!,
        annual = postings.find((p) => p.month === "2020-12")!;
      expect(
        (
          await cancelDepreciation({
            id: d.id,
            entryId: jan.entryId,
            version: (await asset(d.id)).updatedAt.toISOString(),
            reason: "wrong order",
          })
        ).ok,
      ).toBe(false);
      good(
        await cancelDepreciation({
          id: d.id,
          entryId: annual.entryId,
          version: (await asset(d.id)).updatedAt.toISOString(),
          reason: "訂正",
        }),
      );
      expect(
        await prisma.depreciationPosting.count({
          where: { assetId: d.id, active: false },
        }),
      ).toBe(11);
      expect(
        await prisma.journalEntry.count({
          where: { reversalOf: annual.entryId },
        }),
      ).toBe(1);
      good(await post(d.id, 2020));
      good(await post(d.id, 2021));
      expect(
        (
          await prisma.depreciationPosting.aggregate({
            where: { assetId: d.id, active: true },
            _sum: { amount: true },
          })
        )._sum.amount,
      ).toBe(640000);
      expect(
        (
          await saveAsset({
            ...d,
            cost: 999999,
            version: (await asset(d.id)).updatedAt.toISOString(),
          })
        ).ok,
      ).toBe(false);
      good(
        await saveAsset({
          ...d,
          name: "改称",
          version: (await asset(d.id)).updatedAt.toISOString(),
        }),
      );
    });
    it("serializes concurrent posts and blocks stale edits and future periods", async () => {
      const d = data();
      good(await saveAsset(d));
      const version = (await asset(d.id)).updatedAt.toISOString();
      const results = await Promise.all(
        [1, 2].map(() =>
          postDepreciation({
            id: d.id,
            version,
            mode: "YEAR",
            year: 2020,
            month: "2020-01",
          }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(
        await prisma.depreciationPosting.count({
          where: { assetId: d.id, active: true },
        }),
      ).toBe(12);
      expect((await saveAsset({ ...d, version, name: "stale" })).ok).toBe(
        false,
      );
      expect((await post(d.id, 2098)).ok).toBe(false);
      good(
        await archiveAsset({
          id: d.id,
          version: (await asset(d.id)).updatedAt.toISOString(),
          archived: true,
        }),
      );
      expect((await post(d.id, 2021)).ok).toBe(false);
    });
    it("isolates owners for save, posting, reversal and archive, including composite FKs", async () => {
      const d = data();
      good(await saveAsset(d));
      good(await post(d.id, 2020));
      const version = (await asset(d.id)).updatedAt.toISOString();
      const p = await prisma.depreciationPosting.findFirstOrThrow({
        where: { assetId: d.id },
      });
      auth.id = users[1];
      expect((await saveAsset({ ...d, version })).ok).toBe(false);
      expect((await post(d.id, 2021)).ok).toBe(false);
      expect(
        (
          await cancelDepreciation({
            id: d.id,
            version,
            entryId: p.entryId,
            reason: "other",
          })
        ).ok,
      ).toBe(false);
      expect(
        (await archiveAsset({ id: d.id, version, archived: true })).ok,
      ).toBe(false);
      auth.id = users[0];
      expect(
        (await saveAsset(data({ assetAccountId: otherAccountId }))).ok,
      ).toBe(false);
      await expect(
        prisma.fixedAsset.update({
          where: { id: d.id },
          data: { assetAccountId: otherAccountId },
        }),
      ).rejects.toThrow();
    });
    it("rolls back failure, enforces active-month uniqueness and protects linked account kind", async () => {
      const custom = await prisma.account.create({
        data: { userId: auth.id, name: "専用科目", code: "FIX", kind: "ASSET" },
      });
      const d = data({ assetAccountId: custom.id });
      good(await saveAsset(d));
      await expect(
        saveAccount({ ...custom, kind: "REVENUE" }),
      ).rejects.toThrow();
      await prisma.account.update({
        where: { id: custom.id },
        data: { active: false },
      });
      expect((await post(d.id, 2020)).ok).toBe(false);
      expect(
        await prisma.depreciationPosting.count({ where: { assetId: d.id } }),
      ).toBe(0);
      expect(
        await prisma.journalEntry.count({ where: { sourceId: d.id } }),
      ).toBe(0);
      await prisma.account.update({
        where: { id: custom.id },
        data: { active: true },
      });
      good(await post(d.id, 2020));
      const p = await prisma.depreciationPosting.findFirstOrThrow({
        where: { assetId: d.id },
      });
      const second = data();
      good(await saveAsset(second));
      good(await post(second.id, 2020));
      const q = await prisma.depreciationPosting.findFirstOrThrow({
        where: { assetId: second.id },
      });
      await expect(
        prisma.depreciationPosting.create({
          data: {
            userId: auth.id,
            assetId: d.id,
            month: p.month,
            amount: 1,
            entryId: q.entryId,
          },
        }),
      ).rejects.toThrow();
    });
  },
);
