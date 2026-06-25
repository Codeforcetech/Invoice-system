"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { printWithBlankTitle } from "@/components/invoices/suppress-browser-print-headers";

function ToolbarAction(props: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";
  const variantClass =
    props.variant === "primary"
      ? "bg-sky-600 text-white shadow-sm hover:bg-sky-700"
      : props.variant === "secondary"
        ? "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900";

  if (props.href) {
    return (
      <a
        className={`${base} ${variantClass}`}
        href={props.href}
        target="_blank"
        rel="noreferrer"
        title={props.title}
      >
        {props.children}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={`${base} ${variantClass}`}
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
    >
      {props.children}
    </button>
  );
}

export function InvoicePreviewModal(props: {
  open: boolean;
  invoiceId: string | null;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeReady, setIframeReady] = useState(false);

  const src = props.invoiceId ? `/invoices/${props.invoiceId}/print?embed=1` : "";

  const runPrint = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    printWithBlankTitle(win);
  }, []);

  const syncIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      const h = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight;
      if (h && h > 0) {
        iframe.style.height = `${h}px`;
      }
    } catch {
      iframe.style.minHeight = "min(297mm, 75vh)";
    }
  }, []);

  useEffect(() => {
    if (!props.open) {
      setIframeReady(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props]);

  useEffect(() => {
    if (props.open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [props.open]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-500/40 print:hidden">
      {/* ツールバー（印刷プレビュー風） */}
      <header className="shrink-0 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">プレビュー / 印刷</h2>
            <p className="mt-0.5 text-xs text-slate-500">帳票の確認、PDF保存、印刷はここから行えます</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToolbarAction
              variant="secondary"
              onClick={runPrint}
              disabled={!iframeReady}
              title="ブラウザの印刷ダイアログを開きます"
            >
              PDFで保存
            </ToolbarAction>
            <ToolbarAction
              variant="primary"
              onClick={runPrint}
              disabled={!iframeReady}
              title="プリンターへ印刷します"
            >
              印刷
            </ToolbarAction>
            <ToolbarAction variant="ghost" onClick={props.onClose}>
              閉じる
            </ToolbarAction>
          </div>
        </div>
        <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-center text-[11px] text-slate-500 sm:px-6">
          「PDFで保存」は送信先で「PDFに保存」を選択してください。下部のURLを消すには、印刷オプションの「ヘッダーとフッター」のチェックを外してください。
        </p>
      </header>

      {/* 用紙エリア */}
      <div className="flex-1 overflow-y-auto bg-slate-200/90 px-4 py-8 sm:px-8 sm:py-10">
        {props.invoiceId ? (
          <div className="mx-auto w-full max-w-[210mm]">
            <div className="mb-3 text-center text-[11px] font-medium tracking-wide text-slate-500 uppercase">
              A4 縦 · プレビュー
            </div>
            <div className="overflow-hidden rounded-sm bg-white shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/80">
              {!iframeReady ? (
                <div className="flex h-[min(297mm,75vh)] min-h-[480px] items-center justify-center bg-white text-sm text-slate-500">
                  帳票を読み込み中…
                </div>
              ) : null}
              <iframe
                ref={iframeRef}
                title="invoice-preview"
                className={`block w-full bg-white ${iframeReady ? "" : "h-0 overflow-hidden"}`}
                style={iframeReady ? { minHeight: "min(297mm, 75vh)" } : undefined}
                src={src}
                onLoad={() => {
                  syncIframeHeight();
                  setIframeReady(true);
                }}
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-md items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/80 px-6 py-16 text-center text-sm text-slate-600">
            先に請求書を保存するとプレビューできます。
          </div>
        )}
      </div>
    </div>
  );
}
