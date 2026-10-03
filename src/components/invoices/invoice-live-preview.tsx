"use client";

import { useEffect, useRef, useState } from "react";
import {
  InvoicePrintView,
  type InvoiceDocument,
  type InvoicePrintSettings,
} from "@/app/(app)/invoices/_components/invoice-print-view";

/** 印刷と同じ帳票を A4 幅で描画し、プレビュー領域に合わせて縮小する。 */
export function InvoiceLivePreview(props: {
  invoice: InvoiceDocument;
  settings: InvoicePrintSettings;
  zoomed?: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ scale: 1, height: 1123 });

  useEffect(() => {
    const update = () => {
      if (!frame.current || !paper.current || !frame.current.clientWidth)
        return;
      const scale = props.zoomed
        ? 1
        : Math.min(frame.current.clientWidth / 794, 1);
      setSize({ scale, height: paper.current.offsetHeight * scale });
    };
    const observer = new ResizeObserver(update);
    if (frame.current) observer.observe(frame.current);
    if (paper.current) observer.observe(paper.current);
    update();
    return () => observer.disconnect();
  }, [props.zoomed]);

  return (
    <div
      ref={frame}
      className={`mx-auto w-full max-w-[794px] ${props.zoomed ? "min-w-[794px]" : ""}`}
      aria-label="請求書のライブプレビュー"
    >
      <div className="relative" style={{ height: size.height }}>
        <div
          ref={paper}
          className="absolute left-0 top-0 min-h-[1123px] w-[794px] origin-top-left bg-white shadow-lg ring-1 ring-slate-200"
          style={{ transform: `scale(${size.scale})` }}
        >
          <InvoicePrintView
            invoice={props.invoice}
            settings={props.settings}
            embed
            live
          />
        </div>
      </div>
    </div>
  );
}
