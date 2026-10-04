import { getSession } from "@/lib/auth/session";
import { hasRole, resolveWorkspace } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
import { prisma } from "@/lib/db/prisma";
import { buildReceiptPackage, validMonthText } from "@/lib/accounting/received";
import { createZip } from "@/lib/zip";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 60 * 1024 * 1024;
let active = 0;
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

/** 月末で締めた、その月の領収書（と請求書）を、ZIPでまとめて出力する（承認者以上）。 */
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
  if (!validMonthText(month))
    return new Response("月を確認してください。", { status: 400, headers });
  const includeInvoices = sp.get("invoices") !== "0";
  if (active >= 1)
    return new Response("出力中です。時間をおいて再試行してください。", {
      status: 429,
      headers,
    });
  active++;
  try {
    const pack = await buildReceiptPackage(prisma, ws, month, {
      includeInvoices,
    });
    if (!pack.files)
      return new Response("この月にまとめられるファイルがありません。", {
        status: 404,
        headers,
      });
    if (pack.totalBytes > MAX_BYTES)
      return new Response(
        "ファイルが大きすぎます（合計60MBまで）。請求書を除くなど、対象を減らしてください。",
        { status: 422, headers },
      );
    const zip = createZip(pack.entries);
    await recordAudit(prisma, ws, {
      action: "EXPORT_ZIP",
      entity: "EXPORT",
      summary: `${month}分の${includeInvoices ? "請求書・" : ""}領収書をZIPで出力（${pack.files}件）`,
    });
    return new Response(zip as Uint8Array<ArrayBuffer>, {
      headers: {
        ...headers,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="receipts-${month}.zip"; filename*=UTF-8''${encodeURIComponent(`${month}分_領収書まとめ.zip`)}`,
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
  } finally {
    active--;
  }
}
