import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { daysLeft, findActiveLink } from "@/lib/submissions/link";
import { companyNameOf, listLinkSubmissions } from "@/lib/submissions/public";
import { japanToday } from "@/lib/expenses/model";
import { yen } from "@/lib/accounting/model";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { ocrConfigured } from "@/lib/ocr/anthropic";
import { StatusBadge } from "@/components/submissions/submission-detail";
import type { ProfileInput } from "@/lib/submissions/model";

export const dynamic = "force-dynamic";

const empty: ProfileInput = {
  legalName: "",
  address: "",
  phone: "",
  registrationNumber: "",
  bankName: "",
  branchName: "",
  accountType: "",
  accountNumber: "",
  accountHolder: "",
};

/** 外部の人が、請求書と領収書を提出するページ（ログイン不要）。無効なリンクは、すべて同じ404。 */
export default async function SubmitViaLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await findActiveLink(prisma, token);
  if (!link) notFound();
  const [company, list] = await Promise.all([
    companyNameOf(prisma, link.ownerId),
    listLinkSubmissions(prisma, link),
  ]);
  const saved = {
    ...empty,
    ...((link.profile as Partial<ProfileInput> | null) ?? {}),
  };
  const rejected = list.filter((s) => s.status === "REJECTED");
  const left = daysLeft(link.expiresAt);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{link.label}　様</h1>
        <p className="mt-1 text-sm text-slate-600">
          {company ? `${company} への` : ""}
          請求書と領収書を提出します。ログインは不要です。このリンクは、あなた専用です。他の人に教えないでください（あと
          {left}日有効）。
        </p>
      </div>
      {rejected.length > 0 && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <p className="font-semibold">差し戻された提出があります。</p>
          <ul className="mt-1 list-disc pl-5">
            {rejected.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/s/${token}/${s.id}`}
                  className="font-medium underline"
                >
                  {s.month.replace("-", "年")}月分　{s.title}
                </Link>
                {s.rejectReason && <span>：{s.rejectReason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <SubmissionForm
        ai={
          ocrConfigured() && link.aiReadsLimit > link.aiReadsUsed
            ? { left: link.aiReadsLimit - link.aiReadsUsed }
            : undefined
        }
        initialMonth={japanToday().slice(0, 7)}
        external={{ token, profile: saved, contactEmail: "" }}
      />
      {list.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">このリンクで提出した書類</h2>
          {list.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"
            >
              <Link
                href={`/s/${token}/${s.id}`}
                className="font-medium text-sky-700"
              >
                {s.month.replace("-", "年")}月分　{s.title}
              </Link>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">¥{yen(s.total)}</span>
                <StatusBadge status={s.status} />
              </span>
            </div>
          ))}
        </section>
      )}
      <p className="text-xs leading-relaxed text-slate-500">
        入力した内容と添付したファイルは、提出先に送られ、保存されます。ご不明な点は、このリンクを送ってきた方にお問い合わせください。
      </p>
    </div>
  );
}
