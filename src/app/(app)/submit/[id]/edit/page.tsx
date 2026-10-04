import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireSubmitterPage } from "@/lib/auth/require-workspace";
import { loadSubmission } from "@/lib/submissions/queries";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { SubmissionForm } from "@/components/submissions/submission-form";

export default async function EditSubmission({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ws = await requireSubmitterPage();
  const { id } = await params;
  const s = await loadSubmission(prisma, ws, id);
  if (!s || !s.mine) notFound();
  if (!["DRAFT", "REJECTED"].includes(s.status)) redirect(`/submit/${s.id}`);
  return (
    <PageShell maxWidth="4xl">
      <SectionHeader variant="page" title="提出の内容を直す" />
      <SubmissionForm
        initialMonth={s.month}
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
    </PageShell>
  );
}
