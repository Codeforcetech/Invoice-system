"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { MailTemplate } from "@prisma/client";

import { applyTemplateVars } from "@/lib/mail/applyTemplateVars";
import { getInvoiceMailDefaults, sendInvoiceEmail } from "@/actions/invoice-mail-actions";

type Vars = Record<string, string>;

export function SendInvoiceMailModal(props: {
  open: boolean;
  onClose: () => void;
  invoiceId: string | null;
  templates: Pick<MailTemplate, "id" | "name" | "subjectTemplate" | "bodyTemplate">[];
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [defaults, setDefaults] = useState<{
    defaultTo: string;
    defaultCc: string;
    vars: Vars;
    resendDevRedirectTo?: string | null;
  } | null>(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const seededRef = useRef(false);

  const vars = defaults?.vars;

  const previewSubject = useMemo(() => (vars ? applyTemplateVars(subject, vars) : subject), [subject, vars]);
  const previewBody = useMemo(() => (vars ? applyTemplateVars(body, vars) : body), [body, vars]);

  useEffect(() => {
    if (!props.open) {
      seededRef.current = false;
      return;
    }
    setError(null);
    setOk(null);
  }, [props.open]);

  useEffect(() => {
    if (!props.open || !props.invoiceId) {
      setDefaults(null);
      return;
    }
    let cancelled = false;
    setLoadingDefaults(true);
    getInvoiceMailDefaults({ invoiceId: props.invoiceId })
      .then((d) => {
        if (cancelled) return;
        setDefaults(d);
        setTo(d.defaultTo);
        setCc(d.defaultCc);
      })
      .catch(() => {
        if (!cancelled) setDefaults(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDefaults(false);
      });
    return () => {
      cancelled = true;
    };
  }, [props.open, props.invoiceId]);

  useEffect(() => {
    if (!props.open || !defaults?.vars || seededRef.current) return;
    seededRef.current = true;
    setSubject(`【請求書】{{company_name}} {{invoice_number}}`);
    setBody(
      `{{company_name}} 御中\n\nいつもお世話になっております。\n請求書を送付いたします。\n\n件名: {{subject}}\n請求書番号: {{invoice_number}}\n請求日: {{issue_date}}\n支払期限: {{due_date}}\nご請求金額: {{grand_total}}円\n\n帳票URL: {{print_url}}\n\n{{payment_terms}}\n`,
    );
  }, [props.open, defaults]);

  function applyTemplate(t: Pick<MailTemplate, "subjectTemplate" | "bodyTemplate">) {
    setSubject(t.subjectTemplate);
    setBody(t.bodyTemplate);
  }

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 print:hidden">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="text-sm font-semibold">請求書メール送信</div>
          <button type="button" className="text-sm text-zinc-600 hover:underline" onClick={props.onClose}>
            閉じる
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4 text-sm">
          {loadingDefaults ? (
            <div className="text-zinc-600">読み込み中…</div>
          ) : !props.invoiceId ? (
            <div className="text-red-700">請求書を保存してから送信できます。</div>
          ) : null}

          {defaults?.resendDevRedirectTo ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <span className="font-medium">テスト送信モード（Resend）</span>
              <p className="mt-1 leading-relaxed">
                実際の送信先は{" "}
                <span className="font-mono font-medium">{defaults.resendDevRedirectTo}</span>{" "}
                に固定されます（<code className="rounded bg-amber-100/80 px-1">onboarding@resend.dev</code>{" "}
                利用時の制限回避用）。画面上の「宛先」はメール本文の先頭に転記されます。CC/BCC
                は送りません。
              </p>
            </div>
          ) : null}

          {props.templates.length > 0 ? (
            <div>
              <label className="text-xs font-medium text-zinc-600">テンプレート読込</label>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                defaultValue=""
                onChange={(e) => {
                  const id = e.target.value;
                  const t = props.templates.find((x) => x.id === id);
                  if (t) applyTemplate(t);
                  e.target.value = "";
                }}
              >
                <option value="">選択してください</option>
                {props.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-zinc-600">宛先（To）</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">CC（任意）</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2" value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">BCC（任意）</label>
              <input className="mt-1 w-full rounded-lg border px-3 py-2" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">Reply-To（任意）</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">送信元 From（任意・Resend設定に合わせる）</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="例: billing@yourdomain.com"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600">件名（変数可）</label>
            <textarea className="mt-1 w-full rounded-lg border px-3 py-2" rows={2} value={subject} onChange={(e) => setSubject(e.target.value)} />
            <div className="mt-1 text-xs text-zinc-500">プレビュー: {previewSubject}</div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-600">本文（変数可）</label>
            <textarea className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="mt-2 whitespace-pre-wrap rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-800">
              {previewBody}
            </div>
          </div>

          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
          {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</div> : null}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={props.onClose}>
              キャンセル
            </button>
            <button
              type="button"
              disabled={pending || !props.invoiceId}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
              onClick={() => {
                if (!props.invoiceId) return;
                setError(null);
                setOk(null);
                startTransition(async () => {
                  try {
                    await sendInvoiceEmail({
                      invoiceId: props.invoiceId!,
                      to,
                      cc,
                      bcc,
                      replyTo,
                      fromEmail,
                      subject,
                      body,
                    });
                    setOk("送信しました。");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "送信に失敗しました");
                  }
                });
              }}
            >
              {pending ? "送信中…" : "送信する"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
