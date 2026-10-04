import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { findActiveLink } from "@/lib/submissions/link";
import { loadLinkSubmission } from "@/lib/submissions/public";
import { SubmissionForm } from "@/components/submissions/submission-form";
import { ocrConfigured } from "@/lib/ocr/anthropic";

import {
  PublicShell,
  publicMetadata,
} from "@/components/submissions/public-shell";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata;

/** 取り下げた提出、または差し戻された提出を、直して出し直すページ（ログイン不要）。 */
export default async function EditLinkSubmission({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  const link = await findActiveLink(prisma, token);
  if (!link) notFound();
  const s = await loadLinkSubmission(prisma, link, id);
  if (!s) notFound();
  if (!["DRAFT", "REJECTED"].includes(s.status)) redirect(`/s/${token}/${id}`);
  return (
    <PublicShell>
      <div className="space-y-5">
        <Link href={`/s/${token}/${id}`} className="text-sm text-sky-700">
          ← 提出の内容へ戻る
        </Link>
        <h1 className="text-xl font-bold">提出を直して、出し直す</h1>
        <SubmissionForm
          ai={
            ocrConfigured() && link.aiReadsLimit > link.aiReadsUsed
              ? { left: link.aiReadsLimit - link.aiReadsUsed }
              : undefined
          }
          initialMonth={s.month}
          external={{
            token,
            contactEmail: s.contactEmail ?? "",
            profile: {
              legalName: s.senderName,
              address: s.senderAddress,
              phone: "",
              registrationNumber: s.senderRegistration,
              bankName: s.senderBank,
              branchName: "",
              accountType: "",
              accountNumber: "",
              accountHolder: "",
            },
          }}
          data={{
            id: s.id,
            version: s.updatedAt.toISOString(),
            month: s.month,
            title: s.title,
            note: s.note,
            items: s.items.map((i) => ({
              kind: i.kind,
              name: i.name,
              quantity: Number(i.quantity),
              unitPrice: i.unitPrice,
              taxCategory: i.taxCategory,
              note: i.note,
            })),
            files: s.files.map((f) => ({ id: f.id, filename: f.filename })),
            rejectReason: s.rejectReason,
          }}
        />
      </div>
    </PublicShell>
  );
}
