import type { ReactNode } from "react";

const shell =
  "rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export function Card(props: { children: ReactNode; className?: string }) {
  return <div className={[shell, props.className ?? ""].filter(Boolean).join(" ")}>{props.children}</div>;
}

export function CardSection(props: { children: ReactNode; className?: string }) {
  return <div className={["p-6 md:p-8", props.className ?? ""].filter(Boolean).join(" ")}>{props.children}</div>;
}
