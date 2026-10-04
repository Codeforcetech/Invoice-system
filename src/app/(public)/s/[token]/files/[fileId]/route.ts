import { prisma } from "@/lib/db/prisma";
import { findActiveLink } from "@/lib/submissions/link";
import { dispositionName } from "@/lib/evidence/download-name";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "Referrer-Policy": "no-referrer",
};

/** 外部の人が、自分の提出に添付したファイルを開く。そのリンクの提出のファイルだけ。 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await context.params;
  const link = await findActiveLink(prisma, token);
  if (!link || !/^[a-zA-Z0-9-]{1,100}$/.test(fileId))
    return new Response(null, { status: 404, headers });
  const file = await prisma.submissionFile.findFirst({
    where: {
      id: fileId,
      submission: { linkId: link.id, ownerId: link.ownerId },
    },
    select: { data: true, filename: true, mimeType: true },
  });
  if (!file) return new Response(null, { status: 404, headers });
  return new Response(new Uint8Array(file.data), {
    headers: {
      ...headers,
      "Content-Type": file.mimeType,
      "Content-Disposition": `${file.mimeType.startsWith("image/") ? "inline" : "attachment"}; ${dispositionName(file.filename)}`,
    },
  });
}
