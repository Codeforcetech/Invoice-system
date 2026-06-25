import type { InvoiceStatus } from "@prisma/client";

const label: Record<InvoiceStatus, string> = {
  DRAFT: "下書き",
  CONFIRMED: "確定",
  ISSUED: "発行済み",
};

const cls: Record<InvoiceStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600 ring-slate-200/80",
  CONFIRMED: "bg-sky-50 text-sky-800 ring-sky-200/70",
  ISSUED: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
};

export function InvoiceStatusBadge(props: { status: InvoiceStatus }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset",
        cls[props.status],
      ].join(" ")}
    >
      {label[props.status]}
    </span>
  );
}
