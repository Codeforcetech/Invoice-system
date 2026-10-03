"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  markNotificationRead,
  setNotificationEmail,
} from "@/actions/notification-actions";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
const mailStatus: Record<string, string> = {
  DISABLED: "アプリ内のみ",
  PENDING: "メール送信待ち",
  SENDING: "メール処理中",
  SENT: "メール送信サービス受付済み",
  FAILED: "メール再送待ち",
  NEEDS_REVIEW: "メール送信状況の確認が必要",
};
export function Notifications({
  enabled,
  configured,
  rows,
}: {
  enabled: boolean;
  configured: boolean;
  rows: {
    id: string;
    title: string;
    href: string;
    date: string;
    read: boolean;
    emailStatus: string;
  }[];
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch {
      setError("保存できませんでした。再試行してください。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold">通知の受け取り方</h2>
          <p className="my-3 text-sm text-slate-600">
            申請・承認・差戻し・精算の結果をアプリ内でお知らせします。メールには金額やレシートを載せず、ログインして確認するリンクを送ります。
          </p>
          <AppButton
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => setNotificationEmail(!enabled))}
          >
            {enabled
              ? "メール通知をオフにする"
              : "今後のメール通知をオンにする"}
          </AppButton>
          <p className="mt-3 text-xs text-slate-500">
            現在：{enabled ? "アプリ内＋メール通知" : "アプリ内通知のみ"}
            。過去のお知らせは後からメール送信しません。
          </p>
          {!configured && (
            <p className="mt-2 text-sm text-amber-800">
              メール送信サービスが未設定です。有効にしても設定が完了するまではメールは送られません。アプリ内で確認できます。
            </p>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </CardSection>
      </Card>
      {!rows.length && (
        <Card>
          <CardSection>
            <p className="text-sm text-slate-500">まだお知らせはありません。</p>
          </CardSection>
        </Card>
      )}
      {rows.map((n) => (
        <Card key={n.id}>
          <CardSection>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-500">
                  {n.date} ／ {n.read ? "既読" : "未読"}
                </p>
                <h2 className="mt-2 font-semibold">{n.title}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {mailStatus[n.emailStatus] ?? n.emailStatus}
                </p>
              </div>
              <div className="flex gap-2">
                <AppButtonLink href={n.href} variant="secondary">
                  内容を確認
                </AppButtonLink>
                {!n.read && (
                  <AppButton
                    disabled={busy}
                    variant="ghost"
                    onClick={() => void run(() => markNotificationRead(n.id))}
                  >
                    既読にする
                  </AppButton>
                )}
              </div>
            </div>
          </CardSection>
        </Card>
      ))}
    </div>
  );
}
