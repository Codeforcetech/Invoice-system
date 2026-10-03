"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setupClaimWorkspace, saveClaimMember } from "@/actions/claim-actions";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
export function ClaimTeam({
  name,
  ready,
  members,
}: {
  name: string | null;
  ready: boolean;
  members: { email: string; name: string; role: string; active: boolean }[];
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    try {
      const r = await fn();
      setMessage(
        r.ok ? "設定を保存しました。" : (r.error ?? "保存できませんでした。"),
      );
      if (r.ok) router.refresh();
    } catch {
      setMessage("通信できませんでした。再試行してください。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      {message && (
        <p
          role="status"
          className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900"
        >
          {message}
        </p>
      )}
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold">自分の帳簿に経費を集める</h2>
          <p className="my-3 text-sm text-slate-600">
            この精算先で承認した経費は、あなたの会計帳簿に記録されます。既存の請求書や取引先を他のメンバーと共有する設定ではありません。
          </p>
          {!ready ? (
            <AppButtonLink href="/accounting">
              先に会計の初期設定をする
            </AppButtonLink>
          ) : (
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(() => setupClaimWorkspace({ name: f.get("name") }));
              }}
            >
              <label className="min-w-64 flex-1 text-sm">
                精算先の名前
                <input
                  required
                  maxLength={80}
                  name="name"
                  defaultValue={name ?? ""}
                  placeholder="例）株式会社〇〇 経費精算"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <AppButton type="submit" disabled={busy}>
                {name ? "名前を保存" : "精算先を作成"}
              </AppButton>
            </form>
          )}
        </CardSection>
      </Card>
      {name && (
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">申請者・承認者を設定</h2>
            <p className="my-3 text-sm text-slate-600">
              登録済みユーザーのメールアドレスを指定します。承認者はこの精算先の提出済み申請とレシートを閲覧し、承認・差戻しできます。自分の申請は承認できません。
            </p>
            <form
              className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(() =>
                  saveClaimMember({
                    email: f.get("email"),
                    role: f.get("role"),
                    active: true,
                  }),
                );
              }}
            >
              <label className="text-sm">
                ユーザーのメールアドレス
                <input
                  required
                  type="email"
                  name="email"
                  maxLength={254}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="text-sm">
                権限
                <select name="role" className={`mt-1 ${selectClass}`}>
                  <option value="SUBMITTER">申請のみ</option>
                  <option value="APPROVER">申請・承認</option>
                </select>
              </label>
              <div className="self-end">
                <AppButton type="submit" disabled={busy}>
                  メンバーを保存
                </AppButton>
              </div>
            </form>
            <div className="mt-5 space-y-3">
              {members.map((m) => (
                <div
                  key={m.email}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
                >
                  <div>
                    <p className="font-medium">{m.name}</p>
                    <p className="break-all text-sm text-slate-500">
                      {m.email} ／{" "}
                      {m.role === "APPROVER" ? "申請・承認" : "申請のみ"} ／{" "}
                      {m.active ? "有効" : "停止中"}
                    </p>
                  </div>
                  <AppButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        saveClaimMember({
                          email: m.email,
                          role: m.role,
                          active: !m.active,
                        }),
                      )
                    }
                  >
                    {m.active ? "利用を停止" : "利用を再開"}
                  </AppButton>
                </div>
              ))}
            </div>
          </CardSection>
        </Card>
      )}
    </div>
  );
}
