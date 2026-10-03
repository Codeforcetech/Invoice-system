"use client";

import { useMemo, useRef, useState } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import {
  mailTemplateUpsertSchema,
  type MailTemplateUpsertInput,
} from "@/lib/validators/mail-template";
import {
  createMailTemplate,
  deleteMailTemplate,
  updateMailTemplate,
} from "@/actions/mail-template-actions";

export type MailTemplateRow = {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
};

const VAR_HINT = `利用可能な変数例:
{{company_name}} {{invoice_number}} {{subject}} {{issue_date}} {{due_date}} {{grand_total}} {{payment_terms}}`;

export function MailTemplateManager(props: { initialRows: MailTemplateRow[] }) {
  const router = useRouter();
  const formPanel = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(props.initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultEmpty = useMemo(
    (): MailTemplateUpsertInput => ({
      name: "",
      subjectTemplate: "【請求書】{{company_name}} {{invoice_number}}",
      bodyTemplate: `{{company_name}} 御中

いつもお世話になっております。
請求書を送付いたします。

件名: {{subject}}
請求書番号: {{invoice_number}}
請求日: {{issue_date}}
支払期限: {{due_date}}
ご請求金額: {{grand_total}}円

添付の請求書PDFをご確認ください。

{{payment_terms}}
`,
    }),
    [],
  );

  const form = useForm<MailTemplateUpsertInput>({
    resolver: zodResolver(
      mailTemplateUpsertSchema,
    ) as Resolver<MailTemplateUpsertInput>,
    defaultValues: defaultEmpty,
    mode: "onChange",
  });

  function startCreate() {
    setEditingId(null);
    setMessage(null);
    setError(null);
    form.reset(defaultEmpty);
  }

  function startEdit(row: MailTemplateRow) {
    setEditingId(row.id);
    formPanel.current?.scrollIntoView({ block: "start" });
    formPanel.current?.querySelector("input")?.focus({ preventScroll: true });
    setMessage(null);
    setError(null);
    form.reset({
      name: row.name,
      subjectTemplate: row.subjectTemplate,
      bodyTemplate: row.bodyTemplate,
    });
  }

  async function onSubmit(values: MailTemplateUpsertInput) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (editingId) {
        await updateMailTemplate({ id: editingId, data: values });
        setMessage("更新しました。");
        setRows((prev) =>
          prev.map((r) =>
            r.id === editingId
              ? {
                  ...r,
                  name: values.name,
                  subjectTemplate: values.subjectTemplate,
                  bodyTemplate: values.bodyTemplate,
                }
              : r,
          ),
        );
      } else {
        const { id } = await createMailTemplate(values);
        setMessage("登録しました。");
        setRows((prev) => [
          {
            id,
            name: values.name,
            subjectTemplate: values.subjectTemplate,
            bodyTemplate: values.bodyTemplate,
          },
          ...prev,
        ]);
        form.reset(defaultEmpty);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("このテンプレートを削除しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMailTemplate({ id });
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) startCreate();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <div
        ref={formPanel}
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <h2 className="text-sm font-semibold text-slate-900">
          {editingId ? "テンプレートを編集" : "テンプレートを新規登録"}
        </h2>
        <details className="mt-4">
          <summary className="text-xs font-medium text-sky-700">
            自動で差し込める項目を見る
          </summary>
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
            {VAR_HINT}
          </pre>
        </details>
        <form className="mt-4 space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label
              htmlFor="field-name"
              className="text-xs font-medium text-slate-600"
            >
              テンプレート名
            </label>
            <input
              id="field-name"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="field-subjectTemplate"
              className="text-xs font-medium text-slate-600"
            >
              件名テンプレート
            </label>
            <textarea
              id="field-subjectTemplate"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              {...form.register("subjectTemplate")}
            />
            {form.formState.errors.subjectTemplate && (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.subjectTemplate.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="field-bodyTemplate"
              className="text-xs font-medium text-slate-600"
            >
              本文テンプレート
            </label>
            <textarea
              id="field-bodyTemplate"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
              rows={12}
              {...form.register("bodyTemplate")}
            />
            {form.formState.errors.bodyTemplate && (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.bodyTemplate.message}
              </p>
            )}
          </div>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </div>
          ) : null}
          {message ? (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              {message}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-navy hover:bg-brand-gold-hover disabled:opacity-50"
            >
              {busy ? "保存中…" : editingId ? "更新する" : "登録する"}
            </button>
            {editingId ? (
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                onClick={startCreate}
              >
                新規に切り替え
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          登録済み（{rows.length}件）
        </h2>
        <ul className="mt-4 space-y-2">
          {rows.length === 0 ? (
            <li className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
              まだありません。
            </li>
          ) : (
            rows.map((r) => (
              <li
                key={r.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{r.name}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {r.subjectTemplate}
                  </div>
                </div>
                <div className="shrink-0">
                  <button
                    type="button"
                    className="mr-2 text-xs font-medium text-sky-700 hover:underline"
                    onClick={() => startEdit(r)}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-700 hover:underline disabled:opacity-40"
                    disabled={busy}
                    onClick={() => void onDelete(r.id)}
                  >
                    削除
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
