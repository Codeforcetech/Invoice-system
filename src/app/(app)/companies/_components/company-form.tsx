"use client";

import { useState, type ReactNode } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { companyUpsertSchema, type CompanyUpsertInput } from "@/lib/validators/company";
import { createCompany, updateCompany } from "@/actions/company-actions";
import { inputClass, labelClass, textareaClass } from "@/lib/ui/form-classes";

function FormSection(props: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-100 pt-8 first:border-t-0 first:pt-0">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-slate-900">{props.title}</h3>
        {props.description ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{props.description}</p> : null}
      </div>
      {props.children}
    </section>
  );
}

export function CompanyForm(props: {
  mode?: "create" | "edit";
  companyId?: string;
  initialValues?: Partial<CompanyUpsertInput>;
  /** セクション見出し付きレイアウト（詳細・作成画面向け） */
  showSections?: boolean;
}) {
  const mode = props.mode ?? "create";
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const form = useForm<CompanyUpsertInput>({
    resolver: zodResolver(companyUpsertSchema) as Resolver<CompanyUpsertInput>,
    defaultValues: {
      name: "",
      invoiceCode: "",
      defaultDueDays: 30,
      paymentTerms: "",
      commonSubject: "",
      billingEmail: "",
      billingCcEmail: "",
      ...props.initialValues,
    },
    mode: "onChange",
  });

  async function onSubmit(values: CompanyUpsertInput) {
    setSaving(true);
    setError(null);
    setOk(null);
    try {
      if (mode === "create") {
        await createCompany(values);
        setOk("作成しました。");
        form.reset({
          name: "",
          invoiceCode: "",
          defaultDueDays: 30,
          paymentTerms: "",
          commonSubject: "",
          billingEmail: "",
          billingCcEmail: "",
        });
      } else {
        if (!props.companyId) throw new Error("companyId is required");
        await updateCompany({ companyId: props.companyId, data: values });
        setOk("更新しました。");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  const basicFields = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className={labelClass}>会社名</label>
        <input className={`mt-1.5 ${inputClass}`} {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>会社コード（採番用）</label>
        <input
          className={`mt-1.5 font-mono ${inputClass}`}
          placeholder="例) CODEFORCE"
          {...form.register("invoiceCode")}
          onChange={(e) => form.setValue("invoiceCode", e.target.value.toUpperCase(), { shouldValidate: true })}
        />
        <p className="mt-1 text-xs text-slate-500">英大文字・数字・ハイフン。請求書番号のプレフィックスに使われます。</p>
        {form.formState.errors.invoiceCode && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.invoiceCode.message}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>デフォルト支払期限</label>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="shrink-0 text-sm text-slate-600">請求日から</span>
          <input
            type="number"
            min={1}
            max={365}
            className={`w-24 tabular-nums ${inputClass}`}
            {...form.register("defaultDueDays", { valueAsNumber: true })}
          />
          <span className="shrink-0 text-sm text-slate-600">日後</span>
        </div>
        {form.formState.errors.defaultDueDays && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.defaultDueDays.message}</p>
        )}
      </div>
    </div>
  );

  const billingFields = (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <label className={labelClass}>よく使う件名</label>
        <input
          className={`mt-1.5 ${inputClass}`}
          placeholder="例）2026年4月分 システム保守費"
          {...form.register("commonSubject")}
        />
        <p className="mt-1 text-xs text-slate-500">請求書作成時の件名の初期値候補として使われます。</p>
      </div>
      <div>
        <label className={labelClass}>振込条件・備考</label>
        <textarea
          className={`mt-1.5 ${textareaClass}`}
          rows={4}
          placeholder="例）月末締め翌月末払い。振込手数料は貴社ご負担でお願いいたします。"
          {...form.register("paymentTerms")}
        />
        <p className="mt-1 text-xs text-slate-500">帳票・メール本文に差し込まれます。</p>
      </div>
    </div>
  );

  const mailFields = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className={labelClass}>請求書送付先（To）</label>
        <input
          type="email"
          className={`mt-1.5 ${inputClass}`}
          placeholder="billing@example.com"
          {...form.register("billingEmail")}
        />
        {form.formState.errors.billingEmail && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.billingEmail.message}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>CC（任意）</label>
        <input
          type="email"
          className={`mt-1.5 ${inputClass}`}
          placeholder="cc@example.com"
          {...form.register("billingCcEmail")}
        />
        {form.formState.errors.billingCcEmail && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.billingCcEmail.message}</p>
        )}
      </div>
    </div>
  );

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      {props.showSections ? (
        <>
          <FormSection title="基本情報" description="取引先の名称と、請求書番号の採番に使うコードを設定します。">
            {basicFields}
          </FormSection>
          <FormSection title="請求の初期値" description="請求書作成時に自動で入る候補や、帳票に載せる振込条件です。">
            {billingFields}
          </FormSection>
          <FormSection title="メール送付" description="請求書メール送信時の宛先の初期値です。">
            {mailFields}
          </FormSection>
        </>
      ) : (
        <div className="space-y-4">
          {basicFields}
          {billingFields}
          {mailFields}
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {ok ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{ok}</div>
      ) : null}

      <div className="flex justify-end border-t border-slate-100 pt-6">
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          disabled={saving}
        >
          {saving ? "保存中…" : mode === "create" ? "会社を作成" : "変更を保存"}
        </button>
      </div>
    </form>
  );
}
