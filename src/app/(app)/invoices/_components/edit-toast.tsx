"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Toast } from "@/components/ui/toast";

export function EditToast() {
  const sp = useSearchParams();
  const router = useRouter();
  const toastType = useMemo(() => sp.get("toast"), [sp]);
  const [open, setOpen] = useState(toastType === "duplicated");

  const message = toastType === "duplicated" ? "請求書を複製しました" : "";

  return (
    <Toast
      open={open && toastType === "duplicated"}
      message={message}
      variant="success"
      onClose={() => {
        setOpen(false);
        router.replace(window.location.pathname);
      }}
    />
  );
}

