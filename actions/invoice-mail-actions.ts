"use server";

import { Resend } from "resend";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { buildInvoiceShareUrl } from "@/lib/invoice/buildShareUrl";
import { applyTemplateVars } from "@/lib/mail/applyTemplateVars";
import { ensureInvoiceShareToken } from "@/actions/invoice-share-actions";

function fmtYen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

function fmtDate(d: Date) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

export type SendInvoiceMailInput = {
  invoiceId: string;
  to: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  fromEmail?: string;
  subject: string;
  body: string;
  /** 本番URL。未設定時は相対パスをそのまま本文に含める */
  appBaseUrl?: string;
};

/**
 * 請求書メール送信（Resend）。
 * RESEND_API_KEY 未設定時はエラー（MVP: 環境変数で有効化）
 */
export async function sendInvoiceEmail(input: SendInvoiceMailInput) {
  const user = await requireUser();
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "メール送信には環境変数 RESEND_API_KEY の設定が必要です（Resend）。.env に追加してください。",
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, createdById: user.id },
    include: {
      company: true,
    },
  });
  if (!invoice) throw new Error("FORBIDDEN_INVOICE");

  const shareToken = await ensureInvoiceShareToken({ invoiceId: invoice.id, userId: user.id });

  const base =
    input.appBaseUrl?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "";

  const printUrl = buildInvoiceShareUrl(base, shareToken);

  const vars: Record<string, string> = {
    company_name: invoice.company.name,
    invoice_number: invoice.invoiceNumber,
    issue_date: fmtDate(invoice.issueDate),
    due_date: fmtDate(invoice.dueDate),
    grand_total: fmtYen(invoice.grandTotal),
    payment_terms: invoice.company.paymentTerms ?? "",
    print_url: printUrl,
    subject: invoice.subject,
  };

  const subject = applyTemplateVars(input.subject, vars);
  const body = applyTemplateVars(input.body, vars);

  const from =
    input.fromEmail?.trim() ||
    process.env.RESEND_FROM_EMAIL ||
    "onboarding@resend.dev";

  const intendedTo = input.to.trim();
  if (!intendedTo) {
    throw new Error("宛先（To）を入力してください");
  }

  /**
   * Resend の `onboarding@resend.dev` 利用時は、テストメールを「アカウント登録メール」宛にしか送れない。
   * ローカル検証用に RESEND_DEV_REDIRECT_TO を設定すると、実際の To を差し替え、本来の宛先を本文先頭に付与する。
   */
  const devRedirect = process.env.RESEND_DEV_REDIRECT_TO?.trim();
  const effectiveTo = devRedirect || intendedTo;
  const sandboxNote = devRedirect
    ? `[テスト送信 / Resend]\n画面上の宛先（To）: ${intendedTo}\n（Resend サンドボックスのため、実際の送信先は ${devRedirect} に差し替えています）\nCC/BCC はテスト送信中は付与していません。\n\n`
    : "";
  const ccList =
    devRedirect ? undefined : input.cc?.trim() ? input.cc.trim().split(",").map((s) => s.trim()) : undefined;
  const bccList =
    devRedirect ? undefined : input.bcc?.trim() ? input.bcc.trim().split(",").map((s) => s.trim()) : undefined;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: effectiveTo,
    cc: ccList,
    bcc: bccList,
    replyTo: input.replyTo?.trim() || undefined,
    subject,
    text: `${sandboxNote}${body}\n\n---\n帳票（印刷）: ${printUrl}`,
  });

  if (error) {
    throw new Error(error.message || "メール送信に失敗しました");
  }

  return { ok: true };
}

/** フォーム初期値用：請求書＋会社の差し込み変数 */
export async function getInvoiceMailDefaults(params: { invoiceId: string }) {
  const user = await requireUser();
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, createdById: user.id },
    include: { company: true },
  });
  if (!invoice) throw new Error("FORBIDDEN_INVOICE");

  const shareToken = await ensureInvoiceShareToken({ invoiceId: invoice.id, userId: user.id });

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const printUrl = buildInvoiceShareUrl(base, shareToken);

  const devRedirect = process.env.RESEND_DEV_REDIRECT_TO?.trim() || null;

  return {
    defaultTo: invoice.company.billingEmail ?? "",
    defaultCc: invoice.company.billingCcEmail ?? "",
    /** 設定時は送信がこのアドレスに差し替わる（モーダルで案内） */
    resendDevRedirectTo: devRedirect,
    vars: {
      company_name: invoice.company.name,
      invoice_number: invoice.invoiceNumber,
      issue_date: fmtDate(invoice.issueDate),
      due_date: fmtDate(invoice.dueDate),
      grand_total: fmtYen(invoice.grandTotal),
      payment_terms: invoice.company.paymentTerms ?? "",
      print_url: printUrl,
      subject: invoice.subject,
    } satisfies Record<string, string>,
  };
}
