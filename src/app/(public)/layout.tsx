import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "請求書",
};

/** 公開共有ページ（認証なし） */
export default function PublicShareLayout(props: { children: React.ReactNode }) {
  return props.children;
}
