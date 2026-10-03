import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { renderInvoicePdf } from "@/lib/pdf/render-invoice";
import { invoicePdfFilename, MAX_PDF_BYTES } from "@/lib/gmail/mime";
import { invoiceDocumentVersion } from "@/lib/pdf/version";
import { STAMP_ERROR } from "@/lib/pdf/stamp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const error = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: privateHeaders });
// Bound memory/CPU per worker. Ownership is verified before an expensive render begins.
let activeRenders = 0;
export async function GET(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  const session = await getSession();
  if (!session) return error("ログインし直してください。", 401);
  const { invoiceId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(invoiceId))
    return error("請求書が見つかりません。", 404);
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true },
  });
  if (!user) return error("ログインし直してください。", 401);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, createdById: user.id },
    include: { company: true, items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) return error("請求書が見つかりません。", 404);
  const settings = await prisma.systemSetting.findUnique({
    where: { userId: user.id },
  });
  if (!settings) return error("先に発行元の設定を保存してください。", 422);
  const version = new URL(request.url).searchParams.get("version");
  if (
    version &&
    version !==
      invoiceDocumentVersion(
        invoice.updatedAt,
        settings.updatedAt,
        invoice.company.updatedAt,
      )
  )
    return error(
      "請求書または設定が変更されました。画面を開き直して最新のPDFを準備してください。",
      409,
    );
  if (JSON.stringify(invoice).length + JSON.stringify(settings).length > 800000)
    return error(
      "請求書のデータ量が上限を超えました。備考や画像を短くしてください。",
      422,
    );
  if (
    invoice.items.length > 100 ||
    invoice.items.some(
      (item) =>
        item.productName.length > 500 || (item.note?.length ?? 0) > 1000,
    )
  )
    return error(
      "PDFは明細100行以内、品目500文字以内、明細備考1,000文字以内で作成してください。",
      422,
    );
  if (activeRenders >= 3)
    return error("PDFを作成中です。少し待って再試行してください。", 429);
  activeRenders++;
  try {
    const pdf = await renderInvoicePdf(invoice, settings);
    if (pdf.length > MAX_PDF_BYTES)
      return error(
        "PDFが5MBを超えました。明細や画像のサイズを減らしてください。",
        422,
      );
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoicePdfFilename(invoice.invoiceNumber)}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Invoice-Version": invoiceDocumentVersion(
          invoice.updatedAt,
          settings.updatedAt,
          invoice.company.updatedAt,
        ),
      },
    });
  } catch (e) {
    return error(
      e instanceof Error && e.message === STAMP_ERROR
        ? STAMP_ERROR
        : "PDFを作成できませんでした。印影の設定と入力内容を確認してください。",
      422,
    );
  } finally {
    activeRenders--;
  }
}
