import { getSession } from "@/lib/auth/session";
import { hasRole, resolveWorkspace } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { prisma } from "@/lib/db/prisma";
import { csv } from "@/lib/accounting/model";
import { filterSchema } from "@/lib/management/model";
import {
  managementReport,
  reportTable,
  transferRows,
} from "@/lib/management/report";
import { renderAccountingPdf } from "@/lib/pdf/render-accounting";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
let active = 0;
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
  // 経営レポートは、管理者だけ（提出者・ほかのメンバーには見せない）。
  if (!hasRole(ws.role, "ADMIN"))
    return new Response("この操作には管理者の権限が必要です。", {
      status: 403,
      headers,
    });
  const sp = new URL(request.url).searchParams,
    format = sp.get("format"),
    parsed = filterSchema.safeParse(Object.fromEntries(sp));
  if (
    !parsed.success ||
    !["csv", "pdf", "transfer"].includes(format ?? "") ||
    parsed.data.view === "tags" ||
    (format === "transfer" && parsed.data.view !== "payments")
  )
    return new Response("出力形式と期間を確認してください。", {
      status: 400,
      headers,
    });
  if (active >= 2)
    return new Response("出力中です。時間をおいて再試行してください。", {
      status: 429,
      headers,
    });
  active++;
  try {
    const r = await managementReport(ws.ownerId, parsed.data),
      t = reportTable(r);
    if (format === "pdf" && t.rows.length > 1000)
      return new Response("PDFは1,000行までです。期間を短くしてください。", {
        status: 422,
        headers,
      });
    const widths =
      t.headers.length === 6
        ? [85, 130, 270, 100, 80, 100]
        : Array(t.headers.length).fill(765 / t.headers.length);
    const body =
      format === "transfer"
        ? csv(transferRows(r))
        : format === "csv"
          ? csv([[t.title], [t.note], t.headers, ...t.rows])
          : new Uint8Array(
              await renderAccountingPdf(
                t.title,
                `${r.f.from} - ${r.f.to}`,
                t.headers,
                t.rows,
                { note: t.note, widths },
              ),
            );
    await recordAudit(prisma, ws, {
      action: "EXPORT_" + format!.toUpperCase(),
      entity: "EXPORT",
      summary: `${t.title}（${r.f.from}〜${r.f.to}）を${format === "transfer" ? "振込準備CSV" : format!.toUpperCase()}で出力`,
    });
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type":
          format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="seiq-${format === "transfer" ? "transfer-preparation" : r.f.view}-${r.f.from}.${format === "pdf" ? "pdf" : "csv"}"`,
      },
    });
  } catch (e) {
    return new Response(
      e instanceof Error && !e.message.includes("\n")
        ? e.message
        : "出力できませんでした。期間と対象データを確認してください。",
      { status: 422, headers },
    );
  } finally {
    active--;
  }
}
