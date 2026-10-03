"use client";

import { useState } from "react";
import type { Resolver } from "react-hook-form";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  settingsUpdateSchema,
  type SettingsUpdateInput,
} from "@/lib/validators/settings";
import { updateSettings } from "@/actions/settings-actions";
import { inputClass, labelClass, textareaClass } from "@/lib/ui/form-classes";
import { isEmbeddedStamp } from "@/lib/invoice/resolveStampImageUrl";
import { StampImage } from "@/components/invoices/stamp-image";

const sectionBox =
  "rounded-xl border border-slate-100 bg-slate-50/40 p-5 md:p-6";
const sectionTitle = "text-base font-semibold text-slate-900";

export function SettingsForm(props: { initialValues: SettingsUpdateInput }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const form = useForm<SettingsUpdateInput>({
    resolver: zodResolver(
      settingsUpdateSchema,
    ) as Resolver<SettingsUpdateInput>,
    defaultValues: props.initialValues,
    mode: "onChange",
  });

  const taxRate = useWatch({ control: form.control, name: "taxRate" });
  const stampImageUrlWatch = useWatch({
    control: form.control,
    name: "stampImageUrl",
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
      <nav
        aria-label="設定の項目"
        className="flex flex-wrap gap-2 border-b border-slate-100 pb-5"
      >
        {[
          ["issuer", "自社情報・送信元"],
          ["bank", "振込先"],
          ["tax", "消費税"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200"
          >
            {label}
          </a>
        ))}
      </nav>
      <div id="issuer">
        <h2 className={sectionTitle}>自社情報</h2>
        <p className="mt-1 text-sm text-slate-500">
          請求書・帳票に印字される情報です。
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="field-companyName" className={labelClass}>
              自社名
            </label>
            <input
              id="field-companyName"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("companyName")}
            />
            {form.formState.errors.companyName && (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.companyName.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="field-invoiceRegistrationNumber"
              className={labelClass}
            >
              適格請求書番号
            </label>
            <input
              id="field-invoiceRegistrationNumber"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("invoiceRegistrationNumber")}
            />
          </div>
          <div>
            <label htmlFor="field-contactPerson" className={labelClass}>
              担当者名
            </label>
            <input
              id="field-contactPerson"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("contactPerson")}
            />
          </div>

          <div>
            <label htmlFor="field-postalCode" className={labelClass}>
              郵便番号
            </label>
            <input
              id="field-postalCode"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("postalCode")}
            />
          </div>
          <div>
            <label htmlFor="field-address" className={labelClass}>
              住所
            </label>
            <input
              id="field-address"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("address")}
            />
          </div>

          <div>
            <label htmlFor="field-phone" className={labelClass}>
              電話番号
            </label>
            <input
              id="field-phone"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("phone")}
            />
          </div>
          <div>
            <label htmlFor="sender-email" className={labelClass}>
              送信元メールアドレス（Gmail / Google Workspace）
            </label>
            <input
              id="sender-email"
              type="email"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("email")}
            />
            <p className="mt-1 text-xs text-slate-500">
              このアドレスと同じGoogleアカウントで連携すると、PDF添付済みの下書きを作成できます。送信はGmailで行います。
            </p>
            {form.formState.errors.email && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <label htmlFor="field-bankName" className={labelClass}>
              ハンコ画像URL
            </label>
            <div className="mt-1.5 flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <input
                  id="field-bankName"
                  aria-label="ハンコ画像URL"
                  className={inputClass}
                  value={
                    isEmbeddedStamp(stampImageUrlWatch ?? "")
                      ? ""
                      : (stampImageUrlWatch ?? "")
                  }
                  placeholder={
                    isEmbeddedStamp(stampImageUrlWatch ?? "")
                      ? "画像ファイルを登録済み"
                      : "画像URL（任意）"
                  }
                  onChange={(e) =>
                    form.setValue("stampImageUrl", e.target.value, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
                <label className="mt-3 block text-xs font-medium text-slate-600">
                  画像ファイルで登録（PDF添付におすすめ）
                  <input
                    aria-label="印影ファイル"
                    type="file"
                    accept="image/png,image/jpeg"
                    className="mt-1 block w-full text-xs"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (
                        file.size > 512 * 1024 ||
                        !["image/png", "image/jpeg"].includes(file.type)
                      ) {
                        setError(
                          "印影は512KB以下のPNG/JPEGを選択してください。",
                        );
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => {
                        form.setValue("stampImageUrl", String(reader.result), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        setError(null);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="mt-2 text-xs text-slate-500 underline"
                  onClick={() =>
                    form.setValue("stampImageUrl", "", {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  印影を解除
                </button>
                {form.formState.errors.stampImageUrl && (
                  <p className="mt-1 text-xs text-red-600">
                    {form.formState.errors.stampImageUrl.message}
                  </p>
                )}
                <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                  PDF添付には画像ファイルの登録を推奨します。Google
                  Drive共有画像も利用できます。その他の外部URLは画面表示のみ対応します。
                </p>
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <span className="text-xs font-medium text-slate-500">
                  プレビュー
                </span>
                <StampImage
                  url={stampImageUrlWatch}
                  size={64}
                  failLabel="画像を表示できません"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="bank" className={sectionBox}>
        <h2 className={sectionTitle}>振込先情報</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>銀行名</label>
            <input
              className={`mt-1.5 ${inputClass}`}
              {...form.register("bankName")}
            />
          </div>
          <div>
            <label htmlFor="field-branchName" className={labelClass}>
              支店名
            </label>
            <input
              id="field-branchName"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("branchName")}
            />
          </div>
          <div>
            <label htmlFor="field-accountType" className={labelClass}>
              口座種別
            </label>
            <input
              id="field-accountType"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("accountType")}
            />
          </div>
          <div>
            <label htmlFor="field-accountNumber" className={labelClass}>
              口座番号
            </label>
            <input
              id="field-accountNumber"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("accountNumber")}
            />
          </div>
          <div>
            <label htmlFor="field-accountHolder" className={labelClass}>
              口座名義
            </label>
            <input
              id="field-accountHolder"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("accountHolder")}
            />
          </div>
          <div>
            <label htmlFor="field-accountHolderKana" className={labelClass}>
              口座名義カナ
            </label>
            <input
              id="field-accountHolderKana"
              className={`mt-1.5 ${inputClass}`}
              {...form.register("accountHolderKana")}
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="field-transferNote" className={labelClass}>
              振込備考
            </label>
            <textarea
              id="field-transferNote"
              className={`mt-1.5 ${textareaClass}`}
              rows={3}
              {...form.register("transferNote")}
            />
          </div>
        </div>
      </div>

      <div id="tax" className={sectionBox}>
        <h2 className={sectionTitle}>税率</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="field-taxRate" className={labelClass}>
              消費税率（%）
            </label>
            <input
              id="field-taxRate"
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              className={`mt-1.5 ${inputClass}`}
              value={Number.isFinite(taxRate) ? taxRate / 100 : ""}
              onChange={(e) =>
                form.setValue(
                  "taxRate",
                  e.target.value === ""
                    ? NaN
                    : Math.round(Number(e.target.value) * 100),
                  { shouldDirty: true, shouldValidate: true },
                )
              }
            />
            <p className="mt-1.5 text-xs text-slate-500">
              10%の場合は「10」と入力してください。新しく作る請求書の初期値になります。
            </p>
            {form.formState.errors.taxRate && (
              <p className="mt-1 text-sm text-red-600">
                {form.formState.errors.taxRate.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      {ok ? (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {ok}
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 flex justify-end border-t border-slate-100 bg-white/95 py-4">
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
