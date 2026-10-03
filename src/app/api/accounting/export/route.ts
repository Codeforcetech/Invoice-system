import { getSession } from "@/lib/auth/session";
import { resolveWorkspace } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { prisma } from "@/lib/db/prisma";
import { accountingReport, reportSchema } from "@/lib/accounting/reports";
import { csv } from "@/lib/accounting/model";
import { renderAccountingPdf } from "@/lib/pdf/render-accounting";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
let active = 0;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
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
  const sp = new URL(request.url).searchParams;
  const parsed = reportSchema.safeParse(Object.fromEntries(sp));
  const format = sp.get("format");
  if (!parsed.success || !["csv", "pdf"].includes(format ?? ""))
    return new Response("期間と帳簿形式を確認してください。", {
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
    const r = await accountingReport(ws.ownerId, parsed.data);
    if (format === "pdf" && r.rows.length > 1000)
      return new Response("PDFは1,000行までです。期間を短くしてください。", {
        status: 422,
        headers,
      });
    const body =
      format === "csv"
        ? csv([r.headers, ...r.rows])
        : new Uint8Array(
            await renderAccountingPdf(
              r.title,
              `${r.f.from} - ${r.f.to}`,
              r.headers,
              r.rows,
            ),
          );
    await recordAudit(prisma, ws, {
      action: "EXPORT_" + format!.toUpperCase(),
      entity: "EXPORT",
      summary: `${r.title}（${r.f.from}〜${r.f.to}）を${format!.toUpperCase()}で出力`,
    });
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type":
          format === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
        "Content-Disposition": `attachment; filename="seiq-${r.f.view}-${r.f.from}.${format}"`,
      },
    });
  } catch {
    return new Response(
      "出力できませんでした。科目・期間を確認し、対象件数が多い場合は期間を短くしてください。",
      { status: 422, headers },
    );
  } finally {
    active--;
  }
}
