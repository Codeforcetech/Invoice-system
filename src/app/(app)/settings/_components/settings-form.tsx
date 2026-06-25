"use client";

import { useState } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { settingsUpdateSchema, type SettingsUpdateInput } from "@/lib/validators/settings";
import { updateSettings } from "@/actions/settings-actions";
import { inputClass, labelClass, textareaClass } from "@/lib/ui/form-classes";

const sectionBox = "rounded-xl border border-slate-100 bg-slate-50/40 p-5 md:p-6";
const sectionTitle = "text-base font-semibold text-slate-900";

export function SettingsForm(props: { initialValues: SettingsUpdateInput }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const form = useForm<SettingsUpdateInput>({
    resolver: zodResolver(settingsUpdateSchema) as Resolver<SettingsUpdateInput>,
    defaultValues: props.initialValues,
    mode: "onChange",
  });

  async function onSubmit(values: SettingsUpdateInput) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      await updateSettings(values);
      setOk("更新しました。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
      <div>
        <h2 className={sectionTitle}>自社情報</h2>
        <p className="mt-1 text-sm text-slate-500">請求書・帳票に印字される情報です。</p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>自社名</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("companyName")} />
            {form.formState.errors.companyName && (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.companyName.message}</p>
            )}
          </div>

          <div>
            <label className={labelClass}>適格請求書番号</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("invoiceRegistrationNumber")} />
          </div>
          <div>
            <label className={labelClass}>担当者名</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("contactPerson")} />
          </div>

          <div>
            <label className={labelClass}>郵便番号</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("postalCode")} />
          </div>
          <div>
            <label className={labelClass}>住所</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("address")} />
          </div>

          <div>
            <label className={labelClass}>電話番号</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("phone")} />
          </div>
          <div>
            <label className={labelClass}>メールアドレス</label>
            <input type="email" className={`mt-1.5 ${inputClass}`} {...form.register("email")} />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>ハンコ画像URL</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("stampImageUrl")} />
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              画像の直リンク（.png / .jpg など）を推奨します。Google Drive の共有リンクも利用できますが、ファイルの共有設定が「リンクを知っている全員」になっている必要があります。表示できない場合は枠のみになります。
            </p>
          </div>
        </div>
      </div>

      <div className={sectionBox}>
        <h2 className={sectionTitle}>振込先情報</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>銀行名</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("bankName")} />
          </div>
          <div>
            <label className={labelClass}>支店名</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("branchName")} />
          </div>
          <div>
            <label className={labelClass}>口座種別</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("accountType")} />
          </div>
          <div>
            <label className={labelClass}>口座番号</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("accountNumber")} />
          </div>
          <div>
            <label className={labelClass}>口座名義</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("accountHolder")} />
          </div>
          <div>
            <label className={labelClass}>口座名義カナ</label>
            <input className={`mt-1.5 ${inputClass}`} {...form.register("accountHolderKana")} />
          </div>
          <div className="md:col-span-2">
            <label className={labelClass}>振込備考</label>
            <textarea className={`mt-1.5 ${textareaClass}`} rows={3} {...form.register("transferNote")} />
          </div>
        </div>
      </div>

      <div className={sectionBox}>
        <h2 className={sectionTitle}>税率</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>消費税率（bps）</label>
            <input
              inputMode="numeric"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("taxRate", { valueAsNumber: true })}
            />
            <p className="mt-1.5 text-xs text-slate-500">例: 10.00% → 1000（%×100）</p>
            {form.formState.errors.taxRate && (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.taxRate.message}</p>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {ok ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</div>
      ) : null}

      <div className="flex justify-end border-t border-slate-100 pt-6">
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          disabled={saving}
        >
          {saving ? "更新中..." : "設定を更新"}
        </button>
      </div>
    </form>
  );
}
