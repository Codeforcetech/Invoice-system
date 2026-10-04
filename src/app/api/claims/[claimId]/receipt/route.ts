import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { visibleClaimWhere } from "@/lib/claims/access";
import { dispositionName, downloadName } from "@/lib/evidence/download-name";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'",
};
export async function GET(
  _request: Request,
  context: { params: Promise<{ claimId: string }> },
) {
  const session = await getSession();
  if (!session) return new Response(null, { status: 401, headers });
  const { claimId } = await context.params;
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(claimId))
    return new Response(null, { status: 404, headers });
  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { id: true },
  });
  if (!user) return new Response(null, { status: 401, headers });
  const receipt = await prisma.claimReceipt.findFirst({
    where: { claimId, claim: visibleClaimWhere(user.id) },
    select: {
      data: true,
      filename: true,
      mimeType: true,
      claim: {
        select: {
          date: true,
          merchant: true,
          applicant: { select: { name: true } },
        },
      },
    },
  });
  if (!receipt) return new Response(null, { status: 404, headers });
  return new Response(new Uint8Array(receipt.data), {
    headers: {
      ...headers,
      "Content-Type": receipt.mimeType,
      "Content-Disposition": `${receipt.mimeType === "image/webp" ? "inline" : "attachment"}; ${dispositionName(
        downloadName(
          [
            receipt.claim.applicant.name,
            receipt.claim.date.toISOString().slice(0, 10),
            receipt.claim.merchant,
          ],
          receipt.mimeType === "image/webp" ? "webp" : "pdf",
        ),
      )}`,
    },
  });
}
