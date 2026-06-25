import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/require-user";

export const metadata: Metadata = {
  title: "\u200B",
};

/** 帳票・印刷用（サイドバーなし） */
export default async function PrintLayout(props: { children: React.ReactNode }) {
  await requireUser();
  return props.children;
}
