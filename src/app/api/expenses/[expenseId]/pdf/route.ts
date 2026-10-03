import { getSession } from "@/lib/auth/session";
import { resolveWorkspace } from "@/lib/workspace/access";
import { prisma } from "@/lib/db/prisma";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
};
export async function GET(
  _request: Request,
  context: { params: Promise<{ expenseId: string }> },
) {
  const session = await getSession();
  if (!session)
    return Response.json(
      { error: "ログインしてください。" },
      { status: 401, headers },
    );
  const { expenseId } = await context.params;
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(expenseId))
    return new Response(null, { status: 404, headers });
  const ws = await resolveWorkspace(prisma, session.sub);
  const attachment = await prisma.expenseAttachment.findFirst({
    where: { expenseId, expense: { userId: ws.ownerId } },
    select: { data: true, filename: true },
  });
  if (!attachment)
    return Response.json(
      { error: "PDFが見つかりません。" },
      { status: 404, headers },
    );
  return new Response(new Uint8Array(attachment.data), {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="expense.pdf"; filename*=UTF-8''${encodeURIComponent(attachment.filename).replace(/'/g, "%27")}`,
    },
  });
}
