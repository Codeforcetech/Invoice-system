import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type CompanyWithStores = {
  id: string;
  name: string;
  stores: { id: string; name: string; active: boolean }[];
};

/** 取引先と、その店舗（部門）の一覧。売上管理表・請求書・支払いの選択肢に使う。 */
export async function companiesWithStores(
  db: Db,
  ownerId: string,
): Promise<CompanyWithStores[]> {
  return db.company.findMany({
    where: { userId: ownerId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      stores: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, active: true },
      },
    },
  });
}

export const STORE_NAME_MAX = 60;

export function cleanStoreName(raw: string) {
  return raw
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, STORE_NAME_MAX);
}

/** 請求書の明細の店舗は、その取引先の店舗だけを認める（ほかは「店舗なし」にする）。 */
export async function allowedStoreIds(
  db: Db,
  ownerId: string,
  companyId: string,
) {
  const rows = await db.store.findMany({
    where: { companyId, company: { userId: ownerId } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/**
 * 支払いの「取引先」と「店舗」を確かめる。自分の事業所のものだけを認め、
 * 店舗が選ばれていれば、その店舗の取引先を優先する。
 */
export async function resolveExpenseLink(
  db: Db,
  ownerId: string,
  companyId: string | null | undefined,
  storeId: string | null | undefined,
): Promise<{ companyId: string | null; storeId: string | null }> {
  if (storeId) {
    const store = await db.store.findFirst({
      where: { id: storeId, company: { userId: ownerId } },
      select: { id: true, companyId: true },
    });
    if (!store) throw new Error("STORE_INVALID");
    if (companyId && companyId !== store.companyId)
      throw new Error("STORE_INVALID");
    return { companyId: store.companyId, storeId: store.id };
  }
  if (companyId) {
    const company = await db.company.findFirst({
      where: { id: companyId, userId: ownerId },
      select: { id: true },
    });
    if (!company) throw new Error("STORE_INVALID");
    return { companyId: company.id, storeId: null };
  }
  return { companyId: null, storeId: null };
}
