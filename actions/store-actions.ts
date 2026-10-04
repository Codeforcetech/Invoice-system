"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace } from "@/lib/auth/require-workspace";
import { PermissionError } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { cleanStoreName } from "@/lib/stores";

type Result = { ok: true } | { ok: false; error: string };

async function owned(companyId: string, ownerId: string) {
  return prisma.company.findFirst({
    where: { id: companyId, userId: ownerId },
    select: { id: true, name: true },
  });
}

async function guard<T>(
  fn: () => Promise<T>,
): Promise<T | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PermissionError) return { ok: false, error: e.message };
    return {
      ok: false,
      error: "保存できませんでした。もう一度お試しください。",
    };
  }
}

/** 取引先に、店舗（部門）を追加する。同じ名前は追加できない。 */
export async function addStore(
  companyId: string,
  rawName: string,
): Promise<Result> {
  return guard(async () => {
    const ws = await requireWorkspace("EDITOR");
    const name = cleanStoreName(rawName);
    if (!name)
      return { ok: false as const, error: "店舗の名前を入力してください。" };
    const company = await owned(companyId, ws.ownerId);
    if (!company)
      return { ok: false as const, error: "取引先が見つかりません。" };
    const count = await prisma.store.count({ where: { companyId } });
    if (count >= 50)
      return {
        ok: false as const,
        error: "店舗は、1つの取引先に50件までです。",
      };
    const same = await prisma.store.findUnique({
      where: { companyId_name: { companyId, name } },
      select: { id: true },
    });
    if (same)
      return {
        ok: false as const,
        error: "同じ名前の店舗が、すでにあります。",
      };
    await prisma.$transaction(async (tx) => {
      const s = await tx.store.create({
        data: { companyId, name, sortOrder: count + 1 },
      });
      await recordAudit(tx, ws, {
        action: "STORE_CREATE",
        entity: "SETTING",
        entityId: s.id,
        summary: `取引先「${company.name.slice(0, 60)}」に店舗「${name}」を追加`,
      });
    });
    revalidatePath(`/companies/${companyId}`);
    revalidatePath("/accounting/sales-table");
    return { ok: true as const };
  });
}

/** 店舗の名前を変える／使わない（一覧に出さない）にする・もどす。過去の数字は残る。 */
export async function updateStore(
  storeId: string,
  patch: { name?: string; active?: boolean },
): Promise<Result> {
  return guard(async () => {
    const ws = await requireWorkspace("EDITOR");
    const store = await prisma.store.findFirst({
      where: { id: storeId, company: { userId: ws.ownerId } },
      select: { id: true, companyId: true, name: true },
    });
    if (!store) return { ok: false as const, error: "店舗が見つかりません。" };
    const data: { name?: string; active?: boolean } = {};
    if (patch.name !== undefined) {
      const name = cleanStoreName(patch.name);
      if (!name)
        return { ok: false as const, error: "店舗の名前を入力してください。" };
      if (name !== store.name) {
        const same = await prisma.store.findUnique({
          where: { companyId_name: { companyId: store.companyId, name } },
          select: { id: true },
        });
        if (same)
          return {
            ok: false as const,
            error: "同じ名前の店舗が、すでにあります。",
          };
      }
      data.name = name;
    }
    if (patch.active !== undefined) data.active = patch.active;
    await prisma.$transaction(async (tx) => {
      await tx.store.update({ where: { id: storeId }, data });
      await recordAudit(tx, ws, {
        action: "STORE_UPDATE",
        entity: "SETTING",
        entityId: storeId,
        summary: `店舗「${(data.name ?? store.name).slice(0, 60)}」を${
          data.active === false
            ? "使わない設定に"
            : data.active
              ? "使う設定に"
              : "更新"
        }`,
      });
    });
    revalidatePath(`/companies/${store.companyId}`);
    revalidatePath("/accounting/sales-table");
    return { ok: true as const };
  });
}
