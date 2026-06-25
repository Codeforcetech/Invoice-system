"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Resolver } from "react-hook-form";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type { MailTemplate } from "@prisma/client";

import type { CompanyForInvoiceForm } from "@/actions/company-actions";
import { invoiceUpsertSchema, type InvoiceUpsertInput } from "@/lib/validators/invoice";
import { calculateInvoice } from "@/lib/invoice/calculateInvoice";
import { createInvoice, updateInvoice, saveInvoiceAutosave } from "@/actions/invoice-actions";
import { INVOICE_NUMBER_CONFLICT_MESSAGE } from "@/lib/invoice/invoice-messages";
import { ItemTemplateSelector, type ItemTemplateOption } from "@/components/invoices/item-template-selector";
import { AutosaveStatus, type AutosaveUiState } from "@/components/invoices/autosave-status";
import { InvoicePreviewModal } from "@/components/invoices/invoice-preview-modal";
import { SendInvoiceMailModal } from "@/components/invoices/send-invoice-mail-modal";

const LAST_UNIT_PRICE_KEY = "invoice_last_unit_price_v1";

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

function toYenInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.floor(value);
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysToDate(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function dateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function friendlySaveError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message === INVOICE_NUMBER_CONFLICT_MESSAGE) return e.message;
    if (
      e.message.includes("PrismaClient") ||
      e.message.includes("Invalid `") ||
      e.message.includes("Unique constraint")
    ) {
      return "保存に失敗しました。ページを再読み込みしてから再度お試しください。";
    }
    return e.message;
  }
  return "保存に失敗しました";
}

export function InvoiceForm(props: {
  companies: CompanyForInvoiceForm[];
  itemTemplates: ItemTemplateOption[];
  mailTemplates: Pick<MailTemplate, "id" | "name" | "subjectTemplate" | "bodyTemplate">[];
  defaultTaxRateBps: number;
  mode?: "create" | "edit";
  invoiceId?: string;
  initialValues?: Partial<InvoiceUpsertInput>;
}) {
  const router = useRouter();
  const mode = props.mode ?? "create";
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draftInvoiceId, setDraftInvoiceId] = useState<string | null>(
    mode === "edit" && props.invoiceId ? props.invoiceId : null,
  );
  const [autosaveState, setAutosaveState] = useState<AutosaveUiState>("idle");
  const [autosaveErrorDetail, setAutosaveErrorDetail] = useState<string | null>(null);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<Date | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const prevCompanyIdRef = useRef<string>("");

  const form = useForm<InvoiceUpsertInput>({
    resolver: zodResolver(invoiceUpsertSchema) as Resolver<InvoiceUpsertInput>,
    defaultValues: {
      companyId: props.companies[0]?.id ?? "",
      subject: "",
      issueDate: new Date(todayISO()),
      dueDate: new Date(todayISO()),
      withholdingEnabled: false,
      status: "DRAFT",
      items: [
        {
          productName: "",
          unit: "",
          quantity: 1,
          unitPrice: 0,
          amount: 0,
          amountManuallyEdited: false,
          note: "",
        },
      ],
      ...props.initialValues,
    },
    mode: "onChange",
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchItems = form.watch("items");
  const withholdingEnabled = form.watch("withholdingEnabled");
  const statusWatch = form.watch("status");
  const companyIdWatch = useWatch({ control: form.control, name: "companyId" });
  const issueDateWatch = useWatch({ control: form.control, name: "issueDate" });
  const dueDateWatch = useWatch({ control: form.control, name: "dueDate" });
  const dueDateInitSkippedRef = useRef(false);

  const snapshot = useWatch({ control: form.control });
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 明細の自動計算（手修正行は除外）
  useEffect(() => {
    watchItems.forEach((row, idx) => {
      if (!row) return;
      if (row.amountManuallyEdited) return;
      const autoAmount = toYenInt((row.quantity ?? 0) * (row.unitPrice ?? 0));
      if ((row.amount ?? 0) !== autoAmount) {
        update(idx, { ...row, amount: autoAmount });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchItems.map((r) => `${r.quantity}-${r.unitPrice}-${r.amountManuallyEdited}`).join("|")]);

  const summary = useMemo(() => {
    return calculateInvoice({
      items: (watchItems ?? []).map((it) => ({
        quantity: Number(it.quantity ?? 0),
        unitPrice: Number(it.unitPrice ?? 0),
        amount: Number(it.amount ?? 0),
        amountManuallyEdited: Boolean(it.amountManuallyEdited),
      })),
      taxRateBps: props.defaultTaxRateBps,
      withholdingEnabled: Boolean(withholdingEnabled),
    });
  }, [watchItems, props.defaultTaxRateBps, withholdingEnabled]);

  // 会社変更時：件名候補（空のときのみ）
  useEffect(() => {
    if (!companyIdWatch) return;
    if (prevCompanyIdRef.current === companyIdWatch) return;
    prevCompanyIdRef.current = companyIdWatch;
    const c = props.companies.find((x) => x.id === companyIdWatch);
    if (!c) return;
    const sub = form.getValues("subject");
    if (!sub?.trim() && c.commonSubject) {
      form.setValue("subject", c.commonSubject, { shouldValidate: true });
    }
  }, [companyIdWatch, props.companies, form]);

  // 請求日 + 会社の defaultDueDays で支払期限を同期（新規は初回も反映／編集は初回マウントでは上書きしない）
  useEffect(() => {
    const c = props.companies.find((x) => x.id === companyIdWatch);
    if (!c) return;
    const issue =
      issueDateWatch instanceof Date ? issueDateWatch : new Date(issueDateWatch as unknown as string);
    if (Number.isNaN(issue.getTime())) return;
    if (mode === "edit" && !dueDateInitSkippedRef.current) {
      dueDateInitSkippedRef.current = true;
      return;
    }
    const days = c.defaultDueDays ?? 30;
    const due = addDaysToDate(issue, days);
    form.setValue("dueDate", due, { shouldValidate: true });
  }, [companyIdWatch, issueDateWatch, mode, props.companies, form]);

  const runAutosave = useCallback(async () => {
    const values = form.getValues();
    if (values.status !== "DRAFT") {
      setAutosaveState("idle");
      return;
    }
    setAutosaveState("saving");
    setAutosaveErrorDetail(null);
    try {
      const r = await saveInvoiceAutosave({ invoiceId: draftInvoiceId, data: values });
      if (r.ok && "skipped" in r && r.skipped) {
        setAutosaveState("idle");
        return;
      }
      if (!r.ok && r.reason === "invalid") {
        setAutosaveState("waiting");
        return;
      }
      if (!r.ok && r.reason === "number_conflict") {
        setAutosaveState("error");
        setAutosaveErrorDetail(INVOICE_NUMBER_CONFLICT_MESSAGE);
        return;
      }
      if (r.ok && "invoiceId" in r && r.invoiceId) {
        setDraftInvoiceId(r.invoiceId);
        setLastAutosaveAt(new Date());
        setAutosaveState("saved");
        router.refresh();
      }
    } catch {
      setAutosaveState("error");
    }
  }, [draftInvoiceId, form, router]);

  // 自動保存（入力停止後 2.5 秒）
  useEffect(() => {
    if (!snapshot) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void runAutosave();
    }, 2500);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(snapshot), runAutosave]);

  const effectiveInvoiceId = draftInvoiceId ?? props.invoiceId ?? null;
  const lastUnitHint = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const v = localStorage.getItem(LAST_UNIT_PRICE_KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  }, []);

  async function onSubmit(values: InvoiceUpsertInput) {
    setServerError(null);
    setSuccessMessage(null);
    setSaving(true);
    try {
      if (mode === "create") {
        if (draftInvoiceId) {
          await updateInvoice({ invoiceId: draftInvoiceId, data: values });
          setSuccessMessage("保存しました。");
        } else {
          const created = await createInvoice(values);
          setDraftInvoiceId(created.id);
          setSuccessMessage("保存しました。");
        }
        router.refresh();
      } else {
        if (!props.invoiceId) throw new Error("invoiceId is required");
        await updateInvoice({ invoiceId: props.invoiceId, data: values });
        setSuccessMessage("更新しました。");
        router.refresh();
      }
    } catch (e) {
      setServerError(friendlySaveError(e));
    } finally {
      setSaving(false);
    }
  }

  async function onIssue() {
    form.setValue("status", "ISSUED");
    const ok = await form.trigger();
    if (!ok) return;
    await onSubmit(form.getValues());
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="w-full min-w-0 max-w-full space-y-6">
      {/* 上部ツールバー */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-slate-900">
            {mode === "create" ? "請求書の作成" : "請求書の編集"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            左で入力・右で金額確認。下書きは自動保存されます（必須項目が揃った時点から）。
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => setPreviewOpen(true)}
            disabled={!effectiveInvoiceId}
            title={effectiveInvoiceId ? "帳票のプレビュー・印刷" : "保存後に利用できます"}
          >
            プレビュー/印刷
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setMailOpen(true)}
          >
            メール送信
          </button>
        </div>
      </div>

      <div className="grid w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        {/* 左カラム（min-w-0 でテーブル横スクロールが列内に閉じる） */}
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
            <h2 className="text-sm font-semibold text-slate-900">基本情報</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600">発行先会社</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                  {...form.register("companyId")}
                >
                  {props.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.companyId && (
                  <p className="mt-1 text-sm text-red-600">{form.formState.errors.companyId.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600">件名</label>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                  placeholder="例）2026年4月分 業務委託費"
                  list="invoice-subject-suggestions"
                  {...form.register("subject")}
                />
                <datalist id="invoice-subject-suggestions">
                  {props.companies
                    .filter((c) => c.commonSubject)
                    .map((c) => (
                      <option key={c.id} value={c.commonSubject ?? ""} />
                    ))}
                </datalist>
                {form.formState.errors.subject && (
                  <p className="mt-1 text-sm text-red-600">{form.formState.errors.subject.message}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">請求日</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                  value={dateInputValue(
                    issueDateWatch instanceof Date
                      ? issueDateWatch
                      : new Date(issueDateWatch as unknown as string),
                  )}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split("-").map(Number);
                    if (!y || !m || !d) return;
                    form.setValue("issueDate", new Date(y, m - 1, d), { shouldValidate: true });
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">支払期限</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                  value={dateInputValue(
                    dueDateWatch instanceof Date ? dueDateWatch : new Date(dueDateWatch as unknown as string),
                  )}
                  onChange={(e) => {
                    const [y, m, d] = e.target.value.split("-").map(Number);
                    if (!y || !m || !d) return;
                    form.setValue("dueDate", new Date(y, m - 1, d), { shouldValidate: true });
                  }}
                />
              </div>

              <div className="md:col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">源泉所得税</div>
                    <div className="text-xs text-slate-500">請求書単位で選択（どちらか一方）</div>
                  </div>
                  <div className="flex items-center gap-5 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="withholdingEnabledRadio"
                        className="h-4 w-4"
                        checked={Boolean(withholdingEnabled) === true}
                        onChange={() => form.setValue("withholdingEnabled", true, { shouldValidate: true })}
                      />
                      あり
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="withholdingEnabledRadio"
                        className="h-4 w-4"
                        checked={Boolean(withholdingEnabled) === false}
                        onChange={() => form.setValue("withholdingEnabled", false, { shouldValidate: true })}
                      />
                      なし
                    </label>
                    <input type="hidden" {...form.register("withholdingEnabled")} />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">ステータス</label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                  {...form.register("status")}
                >
                  <option value="DRAFT">下書き</option>
                  <option value="CONFIRMED">確定</option>
                  <option value="ISSUED">発行済み</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-900">明細</h2>
                <p className="mt-1 text-xs text-slate-500">Tab / Enter で入力しやすいよう、右寄せで金額系を揃えています。</p>
              </div>
              <button
                type="button"
                className="inline-flex flex-shrink-0 items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
                onClick={() =>
                  append({
                    productName: "",
                    unit: "",
                    quantity: 1,
                    unitPrice: lastUnitHint && lastUnitHint > 0 ? lastUnitHint : 0,
                    amount: 0,
                    amountManuallyEdited: false,
                    note: "",
                  })
                }
              >
                ＋ 明細を追加
              </button>
            </div>

            <div className="mt-4">
              <ItemTemplateSelector
                templates={props.itemTemplates}
                onApply={(row) => append(row)}
                disabled={saving}
              />
            </div>

            {lastUnitHint && lastUnitHint > 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                前回の単価の目安: <span className="font-mono tabular-nums">{yen(lastUnitHint)}</span> 円（新規行に自動反映）
              </p>
            ) : null}

            <div className="mt-4 max-w-full overflow-x-auto rounded-lg border border-slate-200/90">
              <table className="w-full min-w-[640px] border-collapse text-sm md:min-w-[720px] lg:min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/90 text-left text-xs font-medium text-slate-600">
                    <th className="px-3 py-2.5">品目</th>
                    <th className="px-3 py-2.5">単位</th>
                    <th className="px-3 py-2.5 text-right">数量</th>
                    <th className="px-3 py-2.5 text-right">単価（円）</th>
                    <th className="px-3 py-2.5 text-right">金額（円）</th>
                    <th className="px-3 py-2.5">備考</th>
                    <th className="px-3 py-2.5 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f, idx) => {
                    const row = watchItems[idx];
                    const edited = Boolean(row?.amountManuallyEdited);
                    return (
                      <tr key={f.id} className={["border-b border-slate-100", edited ? "bg-amber-50/60" : ""].join(" ")}>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                            {...form.register(`items.${idx}.productName` as const)}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                            {...form.register(`items.${idx}.unit` as const)}
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <input
                            inputMode="decimal"
                            className="ml-auto w-24 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right tabular-nums text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                            {...form.register(`items.${idx}.quantity` as const, { valueAsNumber: true })}
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <Controller
                            control={form.control}
                            name={`items.${idx}.unitPrice` as const}
                            render={({ field }) => (
                              <input
                                inputMode="numeric"
                                className="ml-auto w-32 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right tabular-nums text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                                value={field.value ? field.value.toLocaleString("ja-JP") : ""}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/,/g, "");
                                  if (!/^\d*$/.test(raw)) return;
                                  field.onChange(raw === "" ? 0 : Number(raw));
                                }}
                                onBlur={() => {
                                  try {
                                    if (field.value > 0) localStorage.setItem(LAST_UNIT_PRICE_KEY, String(field.value));
                                  } catch {
                                    /* ignore */
                                  }
                                  field.onBlur();
                                }}
                              />
                            )}
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <Controller
                            control={form.control}
                            name={`items.${idx}.amount` as const}
                            render={({ field }) => (
                              <div>
                                <input
                                  inputMode="numeric"
                                  className={[
                                    "ml-auto w-36 rounded-md border px-2 py-1.5 text-right tabular-nums focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15",
                                    edited ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white",
                                  ].join(" ")}
                                  value={field.value ? field.value.toLocaleString("ja-JP") : ""}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/,/g, "");
                                    if (!/^\d*$/.test(raw)) return;
                                    const n = raw === "" ? 0 : Number(raw);
                                    form.setValue(`items.${idx}.amount`, toYenInt(n), { shouldValidate: true });
                                    form.setValue(`items.${idx}.amountManuallyEdited`, true, { shouldValidate: true });
                                  }}
                                  onBlur={field.onBlur}
                                />
                                <div className="mt-1 flex justify-end">
                                  {edited ? (
                                    <button
                                      type="button"
                                      className="text-xs font-medium text-amber-800 hover:underline"
                                      onClick={() => {
                                        const q = Number(form.getValues(`items.${idx}.quantity`) ?? 0);
                                        const p = Number(form.getValues(`items.${idx}.unitPrice`) ?? 0);
                                        form.setValue(`items.${idx}.amountManuallyEdited`, false, { shouldValidate: true });
                                        form.setValue(`items.${idx}.amount`, toYenInt(q * p), { shouldValidate: true });
                                      }}
                                    >
                                      自動計算に戻す
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-slate-400">自動</span>
                                  )}
                                </div>
                              </div>
                            )}
                          />
                          <input type="hidden" {...form.register(`items.${idx}.amountManuallyEdited` as const)} />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15"
                            {...form.register(`items.${idx}.note` as const)}
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <button
                            type="button"
                            className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-40"
                            onClick={() => remove(idx)}
                            disabled={fields.length <= 1}
                            title={fields.length <= 1 ? "明細は1行以上必要です" : "行を削除"}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {form.formState.errors.items && (
              <p className="mt-2 text-sm text-red-600">{form.formState.errors.items.message as string}</p>
            )}
          </section>
        </div>

        {/* 右カラム：サマリー（固定幅・はみ出し防止） */}
        <aside className="w-full min-w-0 space-y-4 lg:sticky lg:top-6 lg:w-[280px] lg:max-w-[280px] lg:shrink-0">
          <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">ご請求金額（税込）</div>
            <div className="mt-1 break-all text-2xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-3xl">
              {yen(summary.grandTotal)}
              <span className="ml-1 text-base font-medium text-slate-600 sm:text-lg">円</span>
            </div>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
              <div className="flex items-center justify-between gap-2 text-slate-600">
                <span>税抜合計</span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900">{yen(summary.subtotal)}円</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-600">
                <span>消費税</span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900">{yen(summary.taxAmount)}円</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-600">
                <span>税込合計</span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900">{yen(summary.totalWithTax)}円</span>
              </div>
              <div className="flex items-center justify-between gap-2 text-slate-600">
                <span>源泉所得税</span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900">{yen(summary.withholdingTax)}円</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              <AutosaveStatus
                state={statusWatch === "DRAFT" ? autosaveState : "idle"}
                lastSavedAt={lastAutosaveAt}
                hint={
                  statusWatch !== "DRAFT"
                    ? "下書き以外は自動保存しません。"
                    : autosaveState === "error" && autosaveErrorDetail
                      ? autosaveErrorDetail
                      : "必須項目が揃うと自動保存が有効になります。"
                }
              />
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
                状態:{" "}
                <span className="font-medium text-slate-900">
                  {statusWatch === "DRAFT"
                    ? "下書き"
                    : statusWatch === "CONFIRMED"
                      ? "確定"
                      : "発行済み"}
                </span>
              </div>
            </div>

            {serverError ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{serverError}</div>
            ) : null}
            {successMessage ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {successMessage}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
              >
                {saving ? "保存中…" : mode === "create" ? "下書きを保存" : "変更を保存"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void onIssue()}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                発行（ステータスを発行済みにして保存）
              </button>
              <p className="text-[11px] text-slate-500">
                ※発行は保存処理を伴います。必要に応じて確定/発行の運用ルールを後から調整できます。
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-600">
            <div className="font-medium text-slate-800">ショートカット</div>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>明細テンプレートから行を一括追加</li>
              <li>単価はカンマ表示（入力もカンマ可）</li>
              <li>手修正行は色分けされます</li>
            </ul>
          </div>
        </aside>
      </div>

      <InvoicePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        invoiceId={effectiveInvoiceId}
      />

      <SendInvoiceMailModal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        invoiceId={effectiveInvoiceId}
        templates={props.mailTemplates}
      />
    </form>
  );
}
