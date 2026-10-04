import { getSession } from "@/lib/auth/session";
import { hasRole, resolveWorkspace } from "@/lib/workspace/access";
import { prisma } from "@/lib/db/prisma";
import { dispositionName } from "@/lib/evidence/download-name";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
};

/** 提出に添付されたファイル。提出者本人か、承認者以上（下書き以外）だけが取得できる。 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401, headers });
  const { id, fileId } = await context.params;
  if (
    !/^[a-zA-Z0-9-]{1,100}$/.test(id) ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(fileId)
  )
    return new Response(null, { status: 404, headers });
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true },
  });
  if (!user) return new Response(null, { status: 401, headers });
  const ws = await resolveWorkspace(prisma, user.id);
  const file = await prisma.submissionFile.findFirst({
    where: {
      id: fileId,
      submissionId: id,
      submission: { ownerId: ws.ownerId },
    },
    select: {
      data: true,
      filename: true,
      mimeType: true,
      submission: { select: { submitterId: true, status: true } },
    },
  });
  if (!file) return new Response(null, { status: 404, headers });
  const mine = file.submission.submitterId === user.id;
  const reviewer =
    hasRole(ws.role, "APPROVER") && file.submission.status !== "DRAFT";
  if (!mine && !reviewer) return new Response(null, { status: 404, headers });
  const inline = file.mimeType.startsWith("image/");
  return new Response(new Uint8Array(file.data), {
    headers: {
      ...headers,
      "Content-Type": file.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; ${dispositionName(file.filename)}`,
    },
  });
}
