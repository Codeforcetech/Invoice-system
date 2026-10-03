import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { resolveWorkspace } from "@/lib/workspace/access";
import { recordAudit } from "@/lib/workspace/audit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
};
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/** 証憑ファイルのダウンロード。閲覧権限があれば、無効にした証憑も取得できる。 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ evidenceId: string }> },
) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401, headers });
  const { evidenceId } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(evidenceId))
    return new Response(null, { status: 404, headers });
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true },
  });
  if (!user) return new Response(null, { status: 401, headers });
  const ws = await resolveWorkspace(prisma, user.id);
  const file = await prisma.evidenceFile.findFirst({
    where: { id: evidenceId, ownerId: ws.ownerId },
    select: { data: true, filename: true, mimeType: true, counterparty: true },
  });
  if (!file || !ALLOWED.has(file.mimeType))
    return new Response(null, { status: 404, headers });
  await recordAudit(prisma, ws, {
    action: "EVIDENCE_DOWNLOAD",
    entity: "EVIDENCE",
    entityId: evidenceId,
    summary: `証憑をダウンロード（${file.counterparty.slice(0, 60)}）`,
  });
  return new Response(new Uint8Array(file.data), {
    headers: {
      ...headers,
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/'/g, "%27")}`,
    },
  });
}
