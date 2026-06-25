"use client";

import { useEffect } from "react";

const BLANK_TITLE = "\u200B";
const PRINT_STYLE_ID = "invoice-print-hide-browser-chrome";

function injectPrintStyles(doc: Document) {
  if (doc.getElementById(PRINT_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @page { size: A4 portrait; margin: 0 !important; }
    @media print {
      .invoice-print-mask-top,
      .invoice-print-mask-bottom {
        display: block !important;
        position: fixed;
        left: 0;
        right: 0;
        background: #fff;
        z-index: 2147483647;
      }
      .invoice-print-mask-top { top: 0; height: 9mm; }
      .invoice-print-mask-bottom { bottom: 0; height: 11mm; }
    }
  `;
  doc.head.appendChild(style);
}

/** 印刷時にブラウザが挿入するページタイトル（サイト名）を空にする */
export function SuppressBrowserPrintHeaders() {
  useEffect(() => {
    const prev = document.title;
    document.title = BLANK_TITLE;
    injectPrintStyles(document);

    const onBeforePrint = () => {
      document.title = BLANK_TITLE;
      injectPrintStyles(document);
    };
    const onAfterPrint = () => {
      document.title = prev;
    };

    window.addEventListener("beforeprint", onBeforePrint);
    window.addEventListener("afterprint", onAfterPrint);

    return () => {
      window.removeEventListener("beforeprint", onBeforePrint);
      window.removeEventListener("afterprint", onAfterPrint);
      document.title = prev;
    };
  }, []);

  return null;
}

export function printWithBlankTitle(win: Window) {
  const doc = win.document;
  const prev = doc.title;
  doc.title = BLANK_TITLE;
  injectPrintStyles(doc);

  const restore = () => {
    doc.title = prev;
    win.removeEventListener("afterprint", restore);
  };
  win.addEventListener("afterprint", restore);

  win.focus();
  win.print();
}
