"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addWorkspaceMember,
  setMemberActive,
  setMemberRole,
} from "@/actions/workspace-actions";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import {
  WORKSPACE_ROLES,
  roleLabel,
  roleSummary,
  type WorkspaceRole,
} from "@/lib/workspace/access";

type Member = {
  id: string;
  name: string;
  email: string;
  role: WorkspaceRole;
  active: boolean;
};

export function WorkspaceMembers({
  owner,
  members,
}: {
  owner: { name: string; email: string };
  members: Member[];
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
          <h2 className="text-lg font-semibold">権限の種類</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            {WORKSPACE_ROLES.map((r) => (
              <div
                key={r}
                className="rounded-xl border border-slate-200 p-4 text-sm"
              >
                <dt className="font-medium">{roleLabel[r]}</dt>
                <dd className="mt-1 text-slate-600">{roleSummary[r]}</dd>
              </div>
            ))}
          </dl>
        </CardSection>
      </Card>
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold">メンバーを追加</h2>
          <p className="my-3 text-sm text-slate-600">
            登録済みユーザーのメールアドレスを指定します。請求書や会計データを持っていない新しいアカウントだけ追加できます。追加すると、この事業所の請求書・取引先・帳簿を共有して使います。
          </p>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_180px_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              void run(async () => {
                const r = await addWorkspaceMember({
                  email: f.get("email"),
                  role: f.get("role"),
                });
                if (r.ok) form.reset();
                return r;
              });
            }}
          >
            <label className="text-sm">
              ユーザーのメールアドレス
              <input
                required
                type="email"
                name="email"
                maxLength={200}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              権限
              <select
                name="role"
                defaultValue="EDITOR"
                className={`mt-1 ${selectClass}`}
              >
                {WORKSPACE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </select>
            </label>
            <div className="self-end">
              <AppButton type="submit" disabled={busy}>
                メンバーを追加
              </AppButton>
            </div>
          </form>
        </CardSection>
      </Card>
      <Card>
        <CardSection>
          <h2 className="text-lg font-semibold">メンバー一覧</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium">{owner.name}（あなた）</p>
              <p className="break-all text-sm text-slate-500">
                {owner.email} ／ 管理者（事業所の所有者）
              </p>
            </div>
            {members.map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"
              >
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="break-all text-sm text-slate-500">
                    {m.email} ／ {m.active ? "有効" : "停止中"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`${m.name}の権限`}
                    value={m.role}
                    disabled={busy}
                    className={selectClass}
                    onChange={(e) =>
                      void run(() =>
                        setMemberRole({ memberId: m.id, role: e.target.value }),
                      )
                    }
                  >
                    {WORKSPACE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel[r]}
                      </option>
                    ))}
                  </select>
                  <AppButton
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        setMemberActive({ memberId: m.id, active: !m.active }),
                      )
                    }
                  >
                    {m.active ? "利用を停止" : "利用を再開"}
                  </AppButton>
                </div>
              </div>
            ))}
            {!members.length && (
              <p className="text-sm text-slate-500">
                まだメンバーがいません。上のフォームから追加できます。
              </p>
            )}
          </div>
        </CardSection>
      </Card>
    </div>
  );
}
