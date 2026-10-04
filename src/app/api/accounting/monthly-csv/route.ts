import { getSession } from "@/lib/auth/session";
import { hasRole, resolveWorkspace } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { prisma } from "@/lib/db/prisma";
import { csv } from "@/lib/accounting/model";
import { validMonthText } from "@/lib/accounting/received";
import { monthlyRows, yearMonths, type Basis } from "@/lib/accounting/monthly";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

/** 月ごとの売上・費用の表を、CSV（スプレッドシート用）で出力する（承認者以上）。 */
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
  const month = sp.get("month") ?? "";
  const basis: Basis = sp.get("basis") === "incurred" ? "incurred" : "paid";
  const year = sp.get("scope") === "year";
  if (!validMonthText(month))
    return new Response("月を確認してください。", { status: 400, headers });
  try {
    const months = year ? yearMonths(month) : [month];
    const rows = await monthlyRows(
      prisma,
      ws,
      months[0],
      months[months.length - 1],
      basis,
    );
    const body = csv([
      [
        "区分",
        "日付",
        "月",
        "取引先",
        "内容",
        "出どころ",
        "税込",
        "消費税",
        "税抜",
        "消費税の区分",
      ],
      ...rows.map((r) => [
        r.kind === "SALES" ? "売上" : "費用",
        r.date,
        r.month,
        r.party,
        r.content,
        r.source,
        r.gross,
        r.tax,
        r.net,
        r.taxUnknown ? "未設定（税抜＝税込として表示）" : "",
      ]),
    ]);
    await recordAudit(prisma, ws, {
      action: "EXPORT_CSV",
      entity: "EXPORT",
      summary: `月ごとの売上・費用（${months[0]}〜${months[months.length - 1]}・${basis === "paid" ? "支払月" : "発生月"}基準）をCSVで出力`,
    });
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="monthly-${year ? month.slice(0, 4) : month}.csv"`,
      },
    });
  } catch {
    return new Response(
      "出力できませんでした。時間をおいて再試行してください。",
      {
        status: 422,
        headers,
      },
    );
  }
}
