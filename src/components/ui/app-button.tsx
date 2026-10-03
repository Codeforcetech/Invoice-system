import Link from "next/link";
import type { ReactNode } from "react";

const base =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:pointer-events-none disabled:opacity-50";

export const appButtonVariants = {
  primary: "bg-sky-600 px-4 py-2.5 text-white shadow-sm hover:bg-sky-700",
  secondary: "border border-slate-200 bg-white px-4 py-2.5 text-slate-700 shadow-sm hover:bg-slate-50",
  ghost: "px-2 py-1.5 text-sky-600 hover:bg-sky-50 hover:text-sky-700",
} as const;

export type AppButtonVariant = keyof typeof appButtonVariants;

export function AppButtonLink(props: {
  href: string;
  variant?: AppButtonVariant;
  children: ReactNode;
  className?: string;
  target?: string;
}) {
  const v = props.variant ?? "primary";
  return (
    <Link
      href={props.href}
      target={props.target}
      className={[base, appButtonVariants[v], props.className ?? ""].filter(Boolean).join(" ")}
    >
      {props.children}
    </Link>
  );
}

export function AppButton(props: {
  type?: "button" | "submit";
  variant?: AppButtonVariant;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const v = props.variant ?? "primary";
  return (
    <button
      type={props.type ?? "button"}
      disabled={props.disabled}
      onClick={props.onClick}
      className={[base, appButtonVariants[v], props.className ?? ""].filter(Boolean).join(" ")}
    >
      {props.children}
    </button>
  );
}
