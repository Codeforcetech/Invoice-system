"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MailTemplate } from "@prisma/client";
import type { CompanyForInvoiceForm } from "@/actions/company-actions";
import {
  invoiceUpsertSchema,
  type InvoiceUpsertInput,
} from "@/lib/validators/invoice";
import {
  calculateInvoice,
  hasTaxCategories,
} from "@/lib/invoice/calculateInvoice";
import { TAX_CATEGORIES, taxCategoryInfo } from "@/lib/tax/categories";
import {
  createInvoice,
  updateInvoice,
  saveInvoiceAutosave,
} from "@/actions/invoice-actions";
import { INVOICE_NUMBER_CONFLICT_MESSAGE } from "@/lib/invoice/invoice-messages";
import {
  ItemTemplateSelector,
  type ItemTemplateOption,
} from "@/components/invoices/item-template-selector";
import {
  AutosaveStatus,
  type AutosaveUiState,
} from "@/components/invoices/autosave-status";
import { InvoicePreviewModal } from "@/components/invoices/invoice-preview-modal";
import { InvoiceLivePreview } from "@/components/invoices/invoice-live-preview";
import { SendInvoiceMailModal } from "@/components/invoices/send-invoice-mail-modal";
import type {
  InvoiceDocument,
  InvoicePrintSettings,
} from "./invoice-print-view";

const inputClass =
  "mt-1.5 block min-w-0 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 disabled:bg-slate-50";
const buttonClass =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass = buttonClass
  .replace("border-slate-200 bg-white", "border-brand-gold bg-brand-gold")
  .replace("text-slate-700", "text-brand-navy")
  .replace("hover:bg-slate-50", "hover:bg-brand-gold-hover");
const LAST_UNIT_PRICE_KEY = "invoice_last_unit_price_v1";
const yen = (n: number) => new Intl.NumberFormat("ja-JP").format(n);
const finite = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const emptyItem = (price = 0) => ({
  productName: "",
  unit: "",
  quantity: 1,
  unitPrice: price,
  amount: price,
  amountManuallyEdited: false,
  note: "",
});
function dateValue(value: Date | string | undefined) {
  const d = new Date(value ?? "");
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function saveError(e: unknown) {
  if (e instanceof Error && e.message === INVOICE_NUMBER_CONFLICT_MESSAGE)
    return e.message;
  return "保存できませんでした。入力内容は残っています。通信状況を確認して、もう一度保存してください。";
}
function Field(props: {
  label: string;
  id: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={props.className}>
      <label
        htmlFor={props.id}
        className="text-xs font-semibold text-slate-600"
      >
        {props.label}
        {props.required && (
          <span className="ml-2 text-[10px] font-medium text-sky-700">
            必須
          </span>
        )}
      </label>
      {props.children}
      {props.error && (
        <p
          id={`${props.id}-error`}
          className="mt-1 text-xs text-red-600"
          role="alert"
        >
          {props.error}
        </p>
      )}
    </div>
  );
}
function Section(props: {
  number: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-xs font-bold text-sky-700">
          {props.number}
        </span>
        <div>
          <h2 className="text-sm font-bold text-slate-900">{props.title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {props.description}
          </p>
        </div>
      </div>
      {props.children}
    </section>
  );
}

export function InvoiceForm(props: {
  companies: CompanyForInvoiceForm[];
  itemTemplates: ItemTemplateOption[];
  mailTemplates: Pick<
    MailTemplate,
    "id" | "name" | "subjectTemplate" | "bodyTemplate"
  >[];
  defaultTaxRateBps: number;
  settings: InvoicePrintSettings;
  invoiceNumber?: string;
  mode?: "create" | "edit";
  invoiceId?: string;
  initialValues?: Partial<InvoiceUpsertInput>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState(props.invoiceNumber);
  const [invoiceId, setInvoiceId] = useState(props.invoiceId ?? null);
  const idRef = useRef(props.invoiceId ?? null);
  const manualSaving = useRef(false);
  const autoInFlight = useRef<Promise<void> | null>(null);
  const savedSnapshot = useRef("");
  const attemptedSnapshot = useRef("");
  const [autosaveState, setAutosaveState] = useState<AutosaveUiState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewZoomed, setPreviewZoomed] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"input" | "preview">("input");
  const [lastUnitPrice, setLastUnitPrice] = useState(0);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const form = useForm<InvoiceUpsertInput>({
    resolver: zodResolver(invoiceUpsertSchema) as Resolver<InvoiceUpsertInput>,
    defaultValues: {
      companyId: "",
      subject: "",
      issueDate: new Date(),
      dueDate: new Date(),
      withholdingEnabled: false,
      status: "DRAFT",
      items: [emptyItem()],
      ...props.initialValues,
    },
    mode: "onChange",
  });
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const snapshot = useWatch({ control: form.control });
  const values = form.getValues();
  const company = props.companies.find((c) => c.id === snapshot.companyId);
  const previousCompany = useRef<string | undefined>(undefined);
  const previousDates = useRef<string | null>(null);
  const errors = form.formState.errors;

  useEffect(() => {
    try {
      setLastUnitPrice(finite(localStorage.getItem(LAST_UNIT_PRICE_KEY)));
    } catch {
      /* optional hint */
    }
  }, []);
  useEffect(() => {
    if (!company || previousCompany.current === company.id) return;
    previousCompany.current = company.id;
    if (!form.getValues("subject").trim() && company.commonSubject)
      form.setValue("subject", company.commonSubject, { shouldValidate: true });
  }, [company, form]);
  const issueDateKey = dateValue(snapshot.issueDate);
  useEffect(() => {
    if (!company || !issueDateKey) return;
    const key = `${company.id}:${issueDateKey}`;
    if (previousDates.current === key) return;
    const first = previousDates.current === null;
    previousDates.current = key;
    if (first && props.mode === "edit") return;
    const d = new Date(`${issueDateKey}T00:00:00`);
    d.setDate(d.getDate() + (company.defaultDueDays ?? 30));
    form.setValue("dueDate", d, { shouldValidate: true });
  }, [company, issueDateKey, form, props.mode]);

  // A manual save waits for an ongoing autosave, so a new draft is never created twice.
  const runAutosave = useCallback(async () => {
    if (manualSaving.current || autoInFlight.current) return;
    const data = form.getValues();
    const fingerprint = JSON.stringify(data);
    if (
      data.status !== "DRAFT" ||
      fingerprint === savedSnapshot.current ||
      fingerprint === attemptedSnapshot.current
    )
      return;
    attemptedSnapshot.current = fingerprint;
    if (!invoiceUpsertSchema.safeParse(data).success) {
      setAutosaveState("waiting");
      return;
    }
    const task = async () => {
      setAutosaveState("saving");
      try {
        const result = await saveInvoiceAutosave({
          invoiceId: idRef.current,
          data,
        });
        if (!result.ok) {
          setAutosaveState(result.reason === "invalid" ? "waiting" : "error");
          return;
        }
        if ("invoiceId" in result && result.invoiceId) {
          idRef.current = result.invoiceId;
          setInvoiceId(result.invoiceId);
          setInvoiceNumber(result.invoiceNumber);
          savedSnapshot.current = fingerprint;
          setLastSavedAt(new Date());
          setAutosaveState(
            JSON.stringify(form.getValues()) === fingerprint
              ? "saved"
              : "waiting",
          );
        }
      } catch {
        setAutosaveState("error");
      }
    };
    autoInFlight.current = task();
    try {
      await autoInFlight.current;
    } finally {
      autoInFlight.current = null;
    }
  }, [form]);
  const snapshotKey = JSON.stringify(snapshot);
  useEffect(() => {
    const timer = setTimeout(() => void runAutosave(), 2500);
    return () => clearTimeout(timer);
  }, [snapshotKey, runAutosave, autosaveState]);

  const normalizedItems = (values.items ?? []).map((item, idx) => ({
    ...item,
    id: fields[idx]?.id ?? String(idx),
    productName: item.productName || "品目名を入力",
    unit: item.unit ?? null,
    note: item.note ?? null,
    quantity: finite(item.quantity),
    unitPrice: finite(item.unitPrice),
    amount: item.amountManuallyEdited
      ? finite(item.amount)
      : Math.floor(finite(item.quantity) * finite(item.unitPrice)),
  }));
  const summary = calculateInvoice({
    items: normalizedItems,
    taxRateBps: props.defaultTaxRateBps,
    withholdingEnabled: Boolean(values.withholdingEnabled),
  });
  const document: InvoiceDocument = {
    id: invoiceId ?? "preview",
    invoiceNumber: invoiceNumber ?? "保存時に自動採番",
    subject: values.subject || "件名を入力",
    company: {
      name: company?.name ?? "取引先を選択",
      paymentTerms: company?.paymentTerms ?? null,
    },
    issueDate: values.issueDate,
    dueDate: values.dueDate,
    taxRate: props.defaultTaxRateBps,
    withholdingEnabled: Boolean(values.withholdingEnabled),
    items: normalizedItems,
    ...summary,
  };
  const checks = [
    { label: "取引先", done: Boolean(company) },
    { label: "件名", done: Boolean(values.subject?.trim()) },
    {
      label: "明細",
      done:
        (values.items?.length ?? 0) > 0 &&
        values.items.every(
          (item) =>
            Boolean(item.productName.trim()) &&
            finite(item.quantity) >= 0 &&
            !Number.isNaN(item.quantity),
        ),
    },
  ];
  const complete = checks.filter((c) => c.done).length;
  const dirty = JSON.stringify(values) !== savedSnapshot.current;
  const dueBeforeIssue =
    dateValue(values.dueDate) < dateValue(values.issueDate);
  const validationProblems = useMemo(() => {
    const result = invoiceUpsertSchema.safeParse(snapshot);
    return result.success
      ? []
      : [...new Set(result.error.issues.map((issue) => issue.message))];
  }, [snapshot]);

  async function persist(data: InvoiceUpsertInput): Promise<string | null> {
    if (manualSaving.current) return null;
    manualSaving.current = true;
    setSaving(true);
    setServerError(null);
    setSuccessMessage(null);
    try {
      await autoInFlight.current;
      const result = idRef.current
        ? await updateInvoice({ invoiceId: idRef.current, data })
        : await createInvoice(data);
      idRef.current = result.id;
      setInvoiceId(result.id);
      setInvoiceNumber(result.invoiceNumber);
      form.setValue("status", data.status);
      savedSnapshot.current = JSON.stringify(data);
      setLastSavedAt(new Date());
      setAutosaveState("saved");
      setSuccessMessage(
        data.status === "ISSUED"
          ? "発行済みとして保存しました。PDF・印刷やGmailの下書き作成に進めます。"
          : "保存しました。入力内容は保存済みです。",
      );
      router.refresh();
      return result.id;
    } catch (e) {
      setServerError(saveError(e));
      return null;
    } finally {
      manualSaving.current = false;
      setSaving(false);
    }
  }
  async function saveAndContinue(next?: "print" | "mail" | "issue") {
    if (manualSaving.current) return;
    setValidationAttempted(true);
    if (!(await form.trigger(undefined, { shouldFocus: true }))) {
      setMobileTab("input");
      return;
    }
    const data = form.getValues();
    const id = await persist(
      next === "issue" ? { ...data, status: "ISSUED" } : data,
    );
    if (!id) return;
    if (next === "print") setPreviewOpen(true);
    if (next === "mail") setMailOpen(true);
  }
  function addItem() {
    append(emptyItem(lastUnitPrice), {
      focusName: `items.${fields.length}.productName`,
    });
  }
  function deadline(months: number) {
    const d = new Date(values.issueDate);
    if (Number.isNaN(d.getTime())) return;
    form.setValue(
      "dueDate",
      new Date(d.getFullYear(), d.getMonth() + months + 1, 0),
      { shouldDirty: true, shouldValidate: true },
    );
  }
  function moneyInput(idx: number, key: "unitPrice" | "amount") {
    return (
      <Controller
        control={form.control}
        name={`items.${idx}.${key}`}
        render={({ field }) => (
          <input
            {...field}
            id={`item-${idx}-${key}`}
            aria-label={`${idx + 1}行目の${key === "unitPrice" ? "単価" : "金額"}`}
            inputMode="numeric"
            className={`${inputClass} text-right tabular-nums`}
            value={
              key === "amount" && !values.items[idx].amountManuallyEdited
                ? yen(normalizedItems[idx].amount)
                : field.value
                  ? yen(field.value)
                  : ""
            }
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[,，]/g, "");
              if (!/^\d*$/.test(raw)) return;
              field.onChange(raw ? Number(raw) : 0);
              if (key === "amount")
                form.setValue(`items.${idx}.amountManuallyEdited`, true, {
                  shouldDirty: true,
                });
            }}
            onBlur={() => {
              field.onBlur();
              if (key === "unitPrice" && field.value > 0) {
                setLastUnitPrice(field.value);
                try {
                  localStorage.setItem(
                    LAST_UNIT_PRICE_KEY,
                    String(field.value),
                  );
                } catch {
                  /* optional hint */
                }
              }
            }}
          />
        )}
      />
    );
  }

  return (
    <form
      noValidate
      onKeyDown={(e) => {
        if (
          e.key !== "Enter" ||
          e.nativeEvent.isComposing ||
          e.keyCode === 229 ||
          !(e.target instanceof HTMLInputElement)
        )
          return;
        e.preventDefault();
        const controls = Array.from(
          e.currentTarget.querySelectorAll<
            HTMLInputElement | HTMLSelectElement
          >("fieldset input, fieldset select"),
        ).filter((el) => !el.disabled && el.offsetParent !== null);
        const next = controls[controls.indexOf(e.target) + 1];
        next?.focus();
      }}
      onSubmit={(e) => {
        e.preventDefault();
        void saveAndContinue();
      }}
      className="invoice-editor min-w-0 space-y-5 text-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/invoices"
          className="text-xs font-medium text-slate-500 hover:text-sky-700"
        >
          ← 請求書一覧
        </Link>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
          {values.status === "ISSUED"
            ? "発行済み"
            : values.status === "CONFIRMED"
              ? "確定"
              : "下書き"}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-sky-100 bg-sky-50/60 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {complete === 3 && validationProblems.length === 0
              ? "入力が揃いました。仕上がりを確認しましょう。"
              : "まずは取引先と請求内容を入力しましょう。"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            入力内容はプレビューにすぐ反映されます。
          </p>
        </div>
        <ol aria-label="入力の進捗" className="flex gap-3 text-xs">
          {checks.map((c, idx) => (
            <li
              key={c.label}
              className={`flex items-center gap-1.5 ${c.done ? "text-sky-700" : "text-slate-500"}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${c.done ? "bg-sky-600 text-white" : "border border-slate-300 bg-white"}`}
              >
                {c.done ? "✓" : idx + 1}
              </span>
              {c.label}
            </li>
          ))}
        </ol>
      </div>
      <div
        className="sticky top-0 z-20 grid grid-cols-2 rounded-xl bg-slate-200 p-1 lg:hidden"
        aria-label="表示の切り替え"
      >
        {(["input", "preview"] as const).map((tab) => (
          <button
            type="button"
            key={tab}
            aria-pressed={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
            className={`rounded-lg py-2.5 text-sm font-semibold ${mobileTab === tab ? "bg-white text-sky-700 shadow-sm" : "text-slate-600"}`}
          >
            {tab === "input" ? "データ入力" : "完成プレビュー"}
          </button>
        ))}
      </div>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <fieldset
          disabled={saving}
          className={`min-w-0 space-y-5 ${mobileTab === "preview" ? "hidden lg:block" : ""}`}
        >
          <legend className="sr-only">請求書の入力</legend>
          <Section
            number="01"
            title="取引先と請求内容"
            description="誰に、何の請求書を送るかを設定します。"
          >
            <div className="space-y-4">
              <Field
                label="取引先"
                id="companyId"
                required
                error={errors.companyId?.message}
              >
                <select
                  id="companyId"
                  aria-invalid={Boolean(errors.companyId)}
                  className={inputClass}
                  {...form.register("companyId")}
                >
                  <option value="">取引先を選択してください</option>
                  {props.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {props.companies.length === 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    取引先が未登録です。
                    <a
                      href="/companies"
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      会社一覧で登録 ↗
                    </a>
                    してから再読み込みしてください。
                  </p>
                )}
              </Field>
              <Field
                label="件名"
                id="subject"
                required
                error={errors.subject?.message}
              >
                <input
                  id="subject"
                  aria-invalid={Boolean(errors.subject)}
                  className={inputClass}
                  placeholder="例）2026年9月分 Webサイト制作費"
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
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(["issueDate", "dueDate"] as const).map((key) => (
                  <Field
                    key={key}
                    label={key === "issueDate" ? "請求日" : "支払期限"}
                    id={key}
                    required
                    error={errors[key]?.message}
                  >
                    <Controller
                      control={form.control}
                      name={key}
                      render={({ field }) => (
                        <input
                          id={key}
                          name={field.name}
                          ref={field.ref}
                          type="date"
                          className={inputClass}
                          value={dateValue(field.value)}
                          onBlur={field.onBlur}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? new Date(`${e.target.value}T00:00:00`)
                                : new Date(NaN),
                            )
                          }
                        />
                      )}
                    />
                  </Field>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                <span className="text-slate-500">支払期限を設定</span>
                <button
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50"
                  type="button"
                  onClick={() => deadline(0)}
                >
                  請求月末
                </button>
                <button
                  className="rounded-md border border-slate-200 px-2.5 py-1.5 hover:bg-slate-50"
                  type="button"
                  onClick={() => deadline(1)}
                >
                  翌月末
                </button>
              </div>
              {dueBeforeIssue && (
                <p className="text-xs text-amber-700" role="status">
                  支払期限が請求日より前になっています。日付をご確認ください。
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-slate-400">
                取引先・請求日を変更すると、支払期限に取引先の設定日数を反映します。
              </p>
            </div>
          </Section>
          <Section
            number="02"
            title="請求明細"
            description="品目・数量・単価を入力すると、金額と税額を自動計算します。"
          >
            {props.itemTemplates.length > 0 && (
              <div className="mb-4">
                <ItemTemplateSelector
                  templates={props.itemTemplates}
                  disabled={saving}
                  onApply={(row) => {
                    if (
                      fields.length === 1 &&
                      !values.items[0].productName &&
                      !values.items[0].unitPrice &&
                      !values.items[0].note &&
                      !values.items[0].amountManuallyEdited
                    )
                      update(0, row);
                    else append(row);
                  }}
                />
              </div>
            )}
            <div className="space-y-4">
              {fields.map((field, idx) => (
                <div
                  key={field.id}
                  className={`rounded-xl border p-4 ${values.items[idx]?.amountManuallyEdited ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-slate-50/50"}`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      明細 {String(idx + 1).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      aria-label={`明細${idx + 1}を削除`}
                      className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      disabled={fields.length <= 1}
                      onClick={() => remove(idx)}
                    >
                      削除
                    </button>
                  </div>
                  <Field
                    id={`item-${idx}-productName`}
                    label="品目"
                    required
                    error={errors.items?.[idx]?.productName?.message}
                  >
                    <input
                      id={`item-${idx}-productName`}
                      className={inputClass}
                      placeholder="例）Webサイト制作"
                      {...form.register(`items.${idx}.productName`)}
                    />
                  </Field>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.5fr)] gap-3">
                    <Field
                      id={`item-${idx}-quantity`}
                      label="数量"
                      error={errors.items?.[idx]?.quantity?.message}
                    >
                      <input
                        id={`item-${idx}-quantity`}
                        className={`${inputClass} text-right tabular-nums`}
                        inputMode="decimal"
                        {...form.register(`items.${idx}.quantity`, {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                    <Field id={`item-${idx}-unit`} label="単位">
                      <input
                        id={`item-${idx}-unit`}
                        className={inputClass}
                        placeholder="式"
                        {...form.register(`items.${idx}.unit`)}
                      />
                    </Field>
                    <Field
                      id={`item-${idx}-unitPrice`}
                      label="単価（円・税抜）"
                      error={errors.items?.[idx]?.unitPrice?.message}
                    >
                      {moneyInput(idx, "unitPrice")}
                    </Field>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field id={`item-${idx}-note`} label="明細の備考">
                      <input
                        id={`item-${idx}-note`}
                        className={inputClass}
                        placeholder="任意"
                        {...form.register(`items.${idx}.note`)}
                      />
                    </Field>
                    <Field
                      id={`item-${idx}-amount`}
                      label="金額（円・税抜）"
                      error={errors.items?.[idx]?.amount?.message}
                    >
                      {moneyInput(idx, "amount")}
                    </Field>
                  </div>
                  <div className="mt-3">
                    <Field
                      id={`item-${idx}-taxCategory`}
                      label="消費税の区分"
                      error={errors.items?.[idx]?.taxCategory?.message}
                    >
                      <select
                        id={`item-${idx}-taxCategory`}
                        className={inputClass}
                        value={values.items[idx]?.taxCategory ?? ""}
                        onChange={(e) =>
                          form.setValue(
                            `items.${idx}.taxCategory`,
                            (e.target.value ||
                              null) as InvoiceUpsertInput["items"][number]["taxCategory"],
                            { shouldDirty: true, shouldValidate: true },
                          )
                        }
                      >
                        <option value="">
                          請求書の税率（{props.defaultTaxRateBps / 100}%）
                        </option>
                        {TAX_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {taxCategoryInfo[c].label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="mt-2 text-right text-[11px]">
                    {values.items[idx]?.amountManuallyEdited ? (
                      <button
                        type="button"
                        className="text-amber-700 underline"
                        onClick={() =>
                          form.setValue(
                            `items.${idx}.amountManuallyEdited`,
                            false,
                            { shouldDirty: true, shouldValidate: true },
                          )
                        }
                      >
                        手入力中 · 自動計算に戻す
                      </button>
                    ) : (
                      <span className="text-slate-400">
                        数量 × 単価で自動計算 · 金額は直接調整できます
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-dashed border-sky-300 bg-sky-50/40 py-3 text-sm font-medium text-sky-700 hover:bg-sky-50"
              onClick={addItem}
            >
              ＋ 明細を追加
            </button>
            {lastUnitPrice > 0 && (
              <p className="mt-2 text-[11px] text-slate-400">
                追加する明細には、前回の単価 {yen(lastUnitPrice)}{" "}
                円を反映します。
              </p>
            )}
          </Section>
          <Section
            number="03"
            title="税額と発行情報"
            description="源泉徴収の有無と、請求書に記載する情報を確認します。"
          >
            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-slate-50 p-3">
              <span>
                <span className="block text-sm font-medium">
                  源泉所得税を差し引く
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  有効にすると、ご請求金額から控除します。
                </span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-sky-600"
                {...form.register("withholdingEnabled")}
              />
            </label>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-500">
                <dt>税抜合計</dt>
                <dd className="tabular-nums">{yen(summary.subtotal)} 円</dd>
              </div>
              {hasTaxCategories(normalizedItems) ? (
                summary.taxGroups.map((g) => (
                  <div key={g.key} className="text-slate-500">
                    <div className="flex justify-between">
                      <dt>
                        {g.label}対象 {yen(g.subtotal)} 円
                      </dt>
                      <dd className="tabular-nums">
                        消費税 {yen(g.taxAmount)} 円
                      </dd>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex justify-between text-slate-500">
                  <dt>消費税（{props.defaultTaxRateBps / 100}%）</dt>
                  <dd className="tabular-nums">{yen(summary.taxAmount)} 円</dd>
                </div>
              )}
              {hasTaxCategories(normalizedItems) && (
                <div className="flex justify-between text-slate-500">
                  <dt>消費税合計</dt>
                  <dd className="tabular-nums">{yen(summary.taxAmount)} 円</dd>
                </div>
              )}
              {values.withholdingEnabled && (
                <div className="flex justify-between text-slate-500">
                  <dt>源泉所得税</dt>
                  <dd className="tabular-nums">
                    −{yen(summary.withholdingTax)} 円
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-200 pt-3 font-semibold">
                <dt>ご請求金額</dt>
                <dd className="text-lg tabular-nums text-sky-700">
                  {yen(summary.grandTotal)} 円
                </dd>
              </div>
            </dl>
            <details className="mt-5 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-xs font-medium text-slate-600">
                発行元・振込先・保存ステータス
              </summary>
              <div className="mt-4 space-y-4 text-xs text-slate-600">
                <p>発行元：{props.settings.companyName}</p>
                <p>
                  振込先：
                  {[
                    props.settings.bankName,
                    props.settings.branchName,
                    props.settings.accountNumber,
                  ]
                    .filter(Boolean)
                    .join(" / ") || "未設定"}
                </p>
                <a
                  href="/settings"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sky-700 underline"
                >
                  発行元・振込先の設定を開く ↗
                </a>
                <p className="text-[11px] text-slate-400">
                  設定の変更後は、入力内容を保存してからこの画面を再読み込みしてください。
                </p>
                <Field id="status" label="保存ステータス">
                  <select
                    id="status"
                    className={inputClass}
                    {...form.register("status")}
                  >
                    <option value="DRAFT">下書き</option>
                    <option value="CONFIRMED">確定</option>
                    <option value="ISSUED">発行済み</option>
                  </select>
                </Field>
              </div>
            </details>
          </Section>
        </fieldset>
        <aside
          className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-200/60 lg:sticky lg:top-6 ${mobileTab === "input" ? "hidden lg:block" : ""}`}
          aria-label="完成プレビュー"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">完成プレビュー</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                A4 縦 · 入力内容をリアルタイムに反映
              </p>
            </div>
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ライブ
            </span>
            <button
              type="button"
              className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              aria-pressed={previewZoomed}
              onClick={() => setPreviewZoomed((v) => !v)}
            >
              {previewZoomed ? "全体表示" : "実寸で確認"}
            </button>
          </div>
          <div className="max-h-[75vh] overflow-auto p-4 sm:p-5 lg:max-h-[calc(100vh-220px)]">
            <InvoiceLivePreview
              invoice={document}
              settings={props.settings}
              zoomed={previewZoomed}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] text-slate-500">
              PDF・印刷では、最新の内容を保存して表示します。
            </p>
            <button
              type="button"
              disabled={saving}
              className="text-xs font-semibold text-sky-700 hover:underline disabled:opacity-50"
              onClick={() => void saveAndContinue("print")}
            >
              拡大・PDF・印刷 ↗
            </button>
          </div>
        </aside>
      </div>
      <div className="sticky bottom-3 z-30 rounded-2xl border border-slate-200 bg-white/95 p-3 sm:p-4 shadow-[0_4px_30px_rgba(15,23,42,0.12)] backdrop-blur">
        {serverError && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {serverError}
          </p>
        )}
        {successMessage && !dirty && (
          <p
            role="status"
            className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
          >
            {successMessage}
          </p>
        )}
        {validationAttempted && validationProblems.length > 0 && (
          <p role="alert" className="mb-3 text-xs text-red-600">
            入力内容をご確認ください：{validationProblems.join(" / ")}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[10px] text-slate-500">ご請求金額</p>
              <p className="text-xl font-bold tabular-nums tracking-tight">
                {yen(summary.grandTotal)}
                <span className="ml-1 text-xs font-normal">円</span>
              </p>
            </div>
            <span
              className="text-[10px] text-slate-500 sm:hidden"
              role="status"
            >
              {saving
                ? "保存中…"
                : autosaveState === "error"
                  ? "自動保存に失敗・保存で再試行"
                  : !dirty && lastSavedAt
                    ? "保存済み"
                    : values.status === "DRAFT"
                      ? "入力後に自動保存"
                      : "変更後は保存してください"}
            </span>
            <div className="hidden sm:block">
              <AutosaveStatus
                state={
                  values.status === "DRAFT"
                    ? dirty && autosaveState === "saved"
                      ? "waiting"
                      : autosaveState
                    : "idle"
                }
                lastSavedAt={lastSavedAt}
                hint={
                  values.status !== "DRAFT"
                    ? "変更後は保存してください"
                    : autosaveState === "error"
                      ? "自動保存できません。保存ボタンで再試行してください"
                      : undefined
                }
              />
            </div>
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center [&>button]:px-2 [&>button]:text-xs sm:[&>button]:px-3.5 sm:[&>button]:text-sm">
            <button
              type="button"
              className={buttonClass}
              disabled={saving}
              onClick={() => void saveAndContinue("mail")}
            >
              Gmail下書き
            </button>
            <button type="submit" className={buttonClass} disabled={saving}>
              {saving
                ? "保存中…"
                : values.status === "DRAFT"
                  ? "下書きを保存"
                  : "変更を保存"}
            </button>
            <button
              type="button"
              className={primaryClass}
              disabled={saving || values.status === "ISSUED"}
              onClick={() => void saveAndContinue("issue")}
            >
              {values.status === "ISSUED" ? "発行済み" : "発行する"}
            </button>
          </div>
        </div>
        <p className="mt-2 hidden text-[10px] text-slate-400 sm:block">
          下書きは必須項目の入力後に自動保存。「発行する」は発行済みとして保存します。メールはGmailで手動送信します。
        </p>
      </div>
      <InvoicePreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        invoiceId={invoiceId}
      />
      <SendInvoiceMailModal
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        invoiceId={invoiceId}
        templates={props.mailTemplates}
      />
    </form>
  );
}
