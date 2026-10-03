import { timingSafeEqual } from "node:crypto";
import { dispatchNotifications } from "@/lib/notifications/service";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.NOTIFICATION_JOB_SECRET,
    token = request.headers.get("authorization") ?? "";
  if (
    !secret ||
    secret.length < 32 ||
    Buffer.byteLength(token) !== Buffer.byteLength(`Bearer ${secret}`) ||
    !timingSafeEqual(Buffer.from(token), Buffer.from(`Bearer ${secret}`))
  )
    return new Response(null, { status: 401 });
  try {
    return Response.json(await dispatchNotifications(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "通知送信設定を確認してください。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
