import { getSession } from "@/lib/auth/session";
import { hasRole, resolveWorkspace } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { prisma } from "@/lib/db/prisma";
import { csv } from "@/lib/accounting/model";
import type { Basis } from "@/lib/accounting/monthly";
import { buildSalesTable, salesTableLines } from "@/lib/accounting/sales-table";
import { companiesWithStores } from "@/lib/stores";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

/** 売上管理表を、CSV（スプレッドシート用）で出力する（承認者以上）。 */
export async function GET(request: Request) {
  const session = await getSession();
  if (
    !session ||
    !(await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true },
    }))
  )
    return new Response("Unauthorized", { status: 401, headers });
  const ws = await resolveWorkspace(prisma, session.sub);
  if (!hasRole(ws.role, "APPROVER"))
    return new Response("この操作には承認者以上の権限が必要です。", {
      status: 403,
      headers,
    });
  const sp = new URL(request.url).searchParams;
  const year = sp.get("year") ?? "";
  if (!/^20\d{2}$/.test(year))
    return new Response("年を確認してください。", { status: 400, headers });
  const basis: Basis = sp.get("basis") === "incurred" ? "incurred" : "paid";
  const mode = sp.get("tax") === "net" ? "net" : "gross";
  try {
    const [{ lines }, companies] = await Promise.all([
      salesTableLines(prisma, ws, year, basis),
      companiesWithStores(prisma, ws.ownerId),
    ]);
    const table = buildSalesTable(lines, companies, {
      mode,
      showAll: true,
      sort: "name",
    });
    const kind = { SALES: "売上", COST: "費用", PROFIT: "差額" } as const;
    const body = csv([
      [
        "取引先",
        "店舗",
        "区分",
        ...Array.from({ length: 12 }, (_, i) => `${i + 1}月`),
        "合計",
      ],
      ...table.blocks.flatMap((b) => [
        ...b.stores.map((r) => [
          b.name,
          r.label,
          kind[r.kind],
          ...r.months,
          r.total,
        ]),
        ...b.summary.map((r) => [
          b.name,
          b.stores.length ? "（取引先の合計）" : "",
          kind[r.kind],
          ...r.months,
          r.total,
        ]),
      ]),
      ...table.totals.map((r) => [
        "全体の合計",
        "",
        kind[r.kind],
        ...r.months,
        r.total,
      ]),
    ]);
    await recordAudit(prisma, ws, {
      action: "EXPORT_CSV",
      entity: "EXPORT",
      summary: `売上管理表（${year}年・${basis === "paid" ? "支払月" : "発生月"}基準）をCSVで出力`,
    });
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sales-table-${year}.csv"`,
      },
    });
  } catch {
    return new Response(
      "出力できませんでした。時間をおいて再試行してください。",
      { status: 422, headers },
    );
  }
}
