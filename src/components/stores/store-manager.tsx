"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStore, updateStore } from "@/actions/store-actions";
import { inputClass } from "@/lib/ui/form-classes";
import { appButtonVariants } from "@/components/ui/app-button";

type Store = { id: string; name: string; active: boolean };

/** 取引先の店舗（部門）の一覧と、追加・名前の変更・使う／使わないの切り替え。 */
export function StoreManager({
  companyId,
  stores,
  canEdit,
}: {
  companyId: string;
  stores: Store[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => ReturnType<typeof addStore>, after?: () => void) =>
    start(async () => {
      setError("");
      const r = await fn();
      if (!r.ok) return setError(r.error);
      after?.();
      router.refresh();
    });
  return (
    <section className="space-y-4" aria-labelledby="stores-title">
      <div>
        <h2 id="stores-title" className="text-base font-semibold">
          店舗（部門）
        </h2>
        <p className="mt-1 text-xs leading-6 text-slate-500">
          この取引先を、店舗や部門ごとに分けて「売上管理表」に出したいときに登録します。登録すると、請求書の明細と支払いで選べます。使わない場合は、登録しなくて大丈夫です。
        </p>
      </div>
      {stores.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {stores.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-3 p-3 text-sm"
            >
              {editing?.id === s.id ? (
                <>
                  <input
                    value={editing.name}
                    onChange={(e) =>
                      setEditing({ id: s.id, name: e.target.value })
                    }
                    maxLength={60}
                    aria-label="店舗の名前"
                    className={`${inputClass} max-w-xs`}
                  />
                  <button
                    type="button"
                    disabled={pending}
                    className={`rounded-xl ${appButtonVariants.primary}`}
                    onClick={() =>
                      run(
                        () => updateStore(s.id, { name: editing.name }),
                        () => setEditing(null),
                      )
                    }
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="text-slate-500"
                    onClick={() => setEditing(null)}
                  >
                    やめる
                  </button>
                </>
              ) : (
                <>
                  <span
                    className={`flex-1 font-medium ${s.active ? "" : "text-slate-400"}`}
                  >
                    {s.name}
                    {!s.active && (
                      <span className="ml-2 text-xs font-normal">
                        （使わない）
                      </span>
                    )}
                  </span>
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        className="text-sky-700"
                        onClick={() => setEditing({ id: s.id, name: s.name })}
                      >
                        名前を変える
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-slate-600"
                        onClick={() =>
                          run(() => updateStore(s.id, { active: !s.active }))
                        }
                      >
                        {s.active ? "使わない" : "使う"}
                      </button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addStore(companyId, name),
              () => setName(""),
            );
          }}
        >
          <label className="text-sm">
            店舗の名前
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder="例：渋谷店"
              className={`mt-1 ${inputClass} w-64`}
            />
          </label>
          <button
            disabled={pending || !name.trim()}
            className={`rounded-xl ${appButtonVariants.primary}`}
          >
            店舗を追加
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
    </section>
  );
}
