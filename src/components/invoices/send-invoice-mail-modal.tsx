"use client";

import { useEffect, useRef, useState } from "react";
import type { MailTemplate } from "@prisma/client";
import { getInvoiceMailDefaults } from "@/actions/invoice-mail-actions";
import { applyTemplateVars } from "@/lib/mail/applyTemplateVars";
import {
  draftInputSchema,
  senderEmailSchema,
  MAX_PDF_BYTES,
} from "@/lib/gmail/mime";
import {
  authorizeGmail,
  createGmailDraft,
  DraftResultUnknownError,
  gmailDraftsUrl,
  loadGoogleIdentity,
} from "@/lib/gmail/client";

type Props = {
  open: boolean;
  onClose: () => void;
  invoiceId: string | null;
  templates: Pick<
    MailTemplate,
    "id" | "name" | "subjectTemplate" | "bodyTemplate"
  >[];
};
type Defaults = Awaited<ReturnType<typeof getInvoiceMailDefaults>>;
const field =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50";
const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function SendInvoiceMailModal(props: Props) {
  return props.open && props.invoiceId ? (
    <GmailComposer
      key={props.invoiceId}
      {...props}
      invoiceId={props.invoiceId}
    />
  ) : null;
}
function GmailComposer(props: Props & { invoiceId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    el?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const abort = new AbortController();
    getInvoiceMailDefaults({ invoiceId: props.invoiceId })
      .then(async (d) => {
        if (cancelled) return;
        setDefaults(d);
        setTo(d.defaultTo);
        setCc(d.defaultCc);
        setSubject(`【請求書】${d.vars.subject}（${d.invoiceNumber}）`);
        setBody(
          `${d.vars.company_name} 御中\n\nいつもお世話になっております。\n${d.vars.sender_name}です。\n\n下記の請求書をPDFにて添付いたします。\nご確認のほど、よろしくお願いいたします。\n\n件名：${d.vars.subject}\n請求書番号：${d.invoiceNumber}\nご請求金額：${d.vars.grand_total}円\nお支払期限：${d.vars.due_date}\n\n${d.vars.payment_terms}\n\n${d.vars.sender_name}\n${d.vars.contact_person}\n${d.defaultFrom}`,
        );
        const response = await fetch(
          `/api/invoices/${encodeURIComponent(props.invoiceId)}/pdf?version=${encodeURIComponent(d.version)}`,
          { cache: "no-store", signal: abort.signal },
        );
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/pdf")
        ) {
          const message = await response.json().catch(() => null);
          throw new Error(
            message?.error ??
              "PDFを取得できませんでした。ログイン状態を確認してください。",
          );
        }
        const blob = await response.blob();
        if (blob.size > MAX_PDF_BYTES)
          throw new Error("PDFが5MBを超えています。");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
          throw new Error("PDFの形式を確認できませんでした。");
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPdf(bytes);
        setPdfUrl(url);
        setPdfError(null);
      })
      .catch((e) => {
        if (!cancelled)
          setPdfError(
            e instanceof Error ? e.message : "請求書を読み込めませんでした。",
          );
      });
    return () => {
      cancelled = true;
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [props.invoiceId, retry]);
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGoogleIdentity()
      .then(() => {
        if (!cancelled) setSdkReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const senderValid = senderEmailSchema.safeParse(
    defaults?.defaultFrom ?? "",
  ).success;
  async function prepareDraft() {
    if (busyRef.current || !pdf || !defaults || createdUrl || unknown) return;
    setError(null);
    let input;
    try {
      input = draftInputSchema.parse({
        from: defaults.defaultFrom,
        to,
        cc,
        bcc,
        subject,
        body,
      });
    } catch (e) {
      setError(
        e instanceof Error && "issues" in e
          ? (e as { issues: { message: string }[] }).issues[0].message
          : e instanceof Error
            ? e.message
            : "入力内容を確認してください。",
      );
      return;
    }
    if (!reviewed) {
      setError("宛先・文面・添付PDFの確認にチェックしてください。");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setPhase("Googleアカウントを確認中…");
    try {
      // Call synchronously from this click before awaiting network requests (popup policy).
      const token = await authorizeGmail(clientId, defaults.defaultFrom);
      setPhase("PDFを添付した下書きを作成中…");
      // Re-check the server snapshot immediately before creating an external draft.
      const latest = await fetch(
        `/api/invoices/${encodeURIComponent(props.invoiceId)}/pdf?version=${encodeURIComponent(defaults.version)}`,
        { cache: "no-store", signal: AbortSignal.timeout(30000) },
      );
      if (
        !latest.ok ||
        !latest.headers.get("content-type")?.includes("application/pdf")
      ) {
        const detail = await latest.json().catch(() => null);
        throw new Error(
          detail?.error ??
            "PDFを再確認できませんでした。画面を開き直してください。",
        );
      }
      const currentPdf = new Uint8Array(await latest.arrayBuffer());
      const draft = await createGmailDraft(
        token,
        input,
        currentPdf,
        defaults.invoiceNumber,
      );
      setCreatedUrl(draft.url);
    } catch (e) {
      if (e instanceof DraftResultUnknownError) setUnknown(true);
      setError(
        e instanceof Error ? e.message : "下書きを作成できませんでした。",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
      setPhase("");
    }
  }
  function changed() {
    setReviewed(false);
  }
  return (
    <dialog
      ref={dialog}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (
          e.key === "Enter" &&
          e.target instanceof HTMLInputElement &&
          !e.nativeEvent.isComposing
        )
          e.preventDefault();
      }}
      aria-labelledby="gmail-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busyRef.current) props.onClose();
      }}
      className="fixed inset-0 m-auto max-h-[94dvh] w-[calc(100%_-_24px)] max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-900/40"
    >
      <div className="flex max-h-[94dvh] flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="gmail-title" className="text-lg font-semibold">
              Gmailで送信する準備
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              宛先・文面・PDFを下書きにまとめます。送信はGmailで手動で行います。
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={props.onClose}
            className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-slate-100 disabled:opacity-40"
          >
            閉じる
          </button>
        </header>
        <div className="space-y-4 overflow-y-auto p-5">
          {createdUrl ? (
            <div
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
              role="status"
            >
              <h3 className="font-semibold text-emerald-900">
                PDF添付済みの下書きを作成しました
              </h3>
              <p className="mt-2 text-sm text-emerald-800">
                まだ送信されていません。Gmailの下書き一覧で「{subject}
                」を開き、内容を確認して送信してください。
              </p>
              <a
                href={createdUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"
              >
                Gmailの下書きを開く ↗
              </a>
            </div>
          ) : null}
          {!clientId && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              この環境ではGmail連携の初期設定がまだ完了していません。PDFの確認・ダウンロードは利用できます。
            </p>
          )}
          {!defaults && !pdfError && (
            <p role="status" className="text-sm text-slate-500">
              請求書と宛先を読み込んでいます…
            </p>
          )}
          {defaults && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">送信元</p>
              <p className="mt-1 text-sm font-semibold">
                {defaults.defaultFrom || "未登録"}
              </p>
              {!senderValid ? (
                <p className="mt-2 text-xs text-amber-800">
                  <a
                    href="/settings"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    設定で送信元を登録 ↗
                  </a>
                  してから、この画面を開き直してください。
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  連携時に、このアドレスと同じGoogleアカウントを選んでください。
                </p>
              )}
            </div>
          )}
          <fieldset
            disabled={busy || Boolean(createdUrl) || !defaults}
            className="min-w-0 space-y-4"
          >
            {props.templates.length > 0 && (
              <label className="block text-xs font-medium text-slate-600">
                文面テンプレート
                <select
                  className={field}
                  defaultValue=""
                  onChange={(e) => {
                    const t = props.templates.find(
                      (x) => x.id === e.target.value,
                    );
                    if (t && defaults) {
                      setSubject(
                        applyTemplateVars(t.subjectTemplate, defaults.vars),
                      );
                      setBody(applyTemplateVars(t.bodyTemplate, defaults.vars));
                      changed();
                    }
                    e.target.value = "";
                  }}
                >
                  <option value="">テンプレートを選択</option>
                  {props.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-xs font-medium text-slate-600">
              宛先（To）
              <input
                className={field}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  changed();
                }}
                placeholder="billing@example.com"
              />
            </label>
            <details>
              <summary className="cursor-pointer text-xs font-medium text-slate-500">
                CC・BCCを追加
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-600">
                  CC
                  <input
                    className={field}
                    value={cc}
                    onChange={(e) => {
                      setCc(e.target.value);
                      changed();
                    }}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  BCC
                  <input
                    className={field}
                    value={bcc}
                    onChange={(e) => {
                      setBcc(e.target.value);
                      changed();
                    }}
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                複数の宛先はカンマで区切ってください。
              </p>
            </details>
            <label className="block text-xs font-medium text-slate-600">
              件名
              <input
                className={field}
                maxLength={200}
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  changed();
                }}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              本文
              <textarea
                className={`${field} leading-relaxed`}
                rows={8}
                maxLength={20000}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  changed();
                }}
              />
            </label>
          </fieldset>
          <section
            className="rounded-xl border border-slate-200 p-4"
            aria-label="添付PDF"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">添付ファイル</p>
                <p className="mt-1 break-all text-sm font-medium">
                  {defaults?.filename ?? "請求書.pdf"}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {pdf
                    ? `PDF準備完了 · ${Math.ceil(pdf.byteLength / 1024)} KB`
                    : pdfError
                      ? "PDFの準備に失敗しました"
                      : "日本語PDFを作成中…"}
                </p>
              </div>
              {pdfUrl && (
                <div className="flex gap-3 text-xs font-semibold text-sky-700">
                  <a href={pdfUrl} target="_blank" rel="noreferrer">
                    PDFを確認 ↗
                  </a>
                  <a href={pdfUrl} download={defaults?.filename}>
                    ダウンロード
                  </a>
                </div>
              )}
            </div>
            {pdfError && (
              <div role="alert" className="mt-3 text-xs text-red-700">
                {pdfError}
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => {
                    setPdfError(null);
                    setReviewed(false);
                    setRetry((v) => v + 1);
                  }}
                >
                  再読み込み
                </button>
              </div>
            )}
          </section>
          {defaults?.status === "DRAFT" && (
            <p className="text-xs text-amber-700">
              この請求書は下書き状態です。送信前に内容が確定しているか確認してください。
            </p>
          )}
          {!createdUrl && (
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-sky-600"
                checked={reviewed}
                disabled={busy || !pdf}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              宛先・文面・添付PDFを確認しました
            </label>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-xs leading-relaxed text-red-700"
            >
              {error}
            </p>
          )}
          {unknown && (
            <div className="flex flex-wrap gap-3 text-xs">
              <a
                href={gmailDraftsUrl(defaults?.defaultFrom ?? "")}
                target="_blank"
                rel="noreferrer"
                className="text-sky-700 underline"
              >
                Gmailの下書きを確認 ↗
              </a>
              <button
                type="button"
                className="text-slate-600 underline"
                onClick={() => {
                  setUnknown(false);
                  setError(null);
                }}
              >
                未作成を確認したので再試行する
              </button>
            </div>
          )}
        </div>
        {!createdUrl && (
          <footer className="border-t border-slate-100 bg-slate-50 px-5 py-4">
            <button
              type="button"
              onClick={() => void prepareDraft()}
              disabled={
                busy ||
                !sdkReady ||
                !pdf ||
                !senderValid ||
                !reviewed ||
                unknown
              }
              className="w-full rounded-lg bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? phase : "Googleと連携して下書きを作成"}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Googleの許可画面には送信権限も含まれますが、このシステムは下書き作成のみ行います。認証情報は保存しません。
            </p>
          </footer>
        )}
      </div>
    </dialog>
  );
}
