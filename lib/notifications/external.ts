import "server-only";
import { z } from "zod";
import { notificationEmailReady } from "./service";

export type ExternalMailResult = "SENT" | "SKIPPED" | "FAILED";

/**
 * 外部の提出者（ログインなし）に、承認・差戻しをメールで知らせる。
 * 送信サービスの設定がない、またはメールアドレスの入力がないときは、送らない（SKIPPED）。
 * 1回だけやり直す。結果は、提出の経過に記録する（失敗しても、承認・差戻し自体は取り消さない）。
 */
export async function sendExternalNotice(input: {
  to: string | null | undefined;
  subject: string;
  text: string;
  idempotencyKey: string;
  fetcher?: typeof fetch;
}): Promise<ExternalMailResult> {
  if (!input.to || !notificationEmailReady()) return "SKIPPED";
  const to = z.string().email().max(200).safeParse(input.to);
  if (!to.success) return "SKIPPED";
  const fetcher = input.fetcher ?? fetch;
  const body = JSON.stringify({
    from: process.env.NOTIFICATION_FROM_EMAIL,
    to: [to.data],
    subject: input.subject.slice(0, 200),
    text: input.text.slice(0, 4000),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey.slice(0, 200),
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return "SENT";
      if (res.status < 500 && res.status !== 429) break; // やり直しても同じ
    } catch {
      /* 次の試行へ */
    }
  }
  return "FAILED";
}
